import onnx
import os
from xxhash import xxh128
from utils.hasher import compute_hash

from onnx import ModelProto
from onnxruntime.quantization import QuantType, quantize_dynamic, quant_pre_process
from onnxruntime.transformers.float16 import convert_float_to_float16
from onnxruntime.transformers.fusion_utils import FusionUtils
from onnxruntime.transformers.onnx_model import OnnxModel

import logging
logger = logging.getLogger(__name__)

def load_onnx_model(fpath: str, is_half: bool, quantize: bool = False) -> ModelProto:
    if is_half:
        return load_cached_fp16_model(fpath)
    if quantize:
        return load_cached_quantized_model(fpath)
    return onnx.load(fpath)

def load_cached_quantized_model(fpath: str) -> ModelProto:
    hashfile = f'{fpath}.xxh128.txt'
    try:
        with open(hashfile, 'r', encoding='utf-8') as f:
            original_hash = f.read()
    except FileNotFoundError:
        original_hash = None
    fname, _ = os.path.splitext(os.path.basename(fpath))
    q8_fpath = os.path.join(os.path.dirname(fpath), f'{fname}.q8.onnx')
    if original_hash is None or not os.path.exists(q8_fpath):
        logger.info('Quantizing model...')
        _quantize(fpath, q8_fpath)
        with open(fpath, 'rb') as f:
            computed_hash = compute_hash(f, xxh128())
        with open(hashfile, 'w', encoding='utf-8') as f:
            f.write(computed_hash)
        model = onnx.load(q8_fpath)
        logger.info('Done!')
    else:
        with open(fpath, 'rb') as f:
            computed_hash = compute_hash(f, xxh128())
        if computed_hash != original_hash:
            logger.info('Original model has changed. Regenerating quantized model...')
            _quantize(fpath, q8_fpath)
            with open(hashfile, 'w', encoding='utf-8') as f:
                f.write(computed_hash)
            model = onnx.load(q8_fpath)
            logger.info('Done!')
        else:
            model = onnx.load(q8_fpath)
    return model

def _quantize(fpath: str, q8_fpath: str):
    quant_pre_process(
        input_model=fpath,
        output_model_path=q8_fpath,
    )
    quantize_dynamic(
        model_input=q8_fpath,
        model_output=q8_fpath,
        op_types_to_quantize=["MatMul", "Attention"],
        weight_type=QuantType.QInt8,
        per_channel=True,
        reduce_range=True,
        extra_options={"WeightSymmetric": False, "MatMulConstBOnly": True},
    )

def load_cached_fp16_model(fpath: str) -> ModelProto:
    hashfile = f'{fpath}.xxh128.txt'
    try:
        with open(hashfile, 'r', encoding='utf-8') as f:
            original_hash = f.read()
    except FileNotFoundError:
        original_hash = None
    fname, _ = os.path.splitext(os.path.basename(fpath))
    fp16_fpath = os.path.join(os.path.dirname(fpath), f'{fname}.fp16.onnx')
    if original_hash is None or not os.path.exists(fp16_fpath):
        logger.info('Converting model to FP16...')
        model = convert_fp16(onnx.load(fpath))
        onnx.save(model, fp16_fpath)
        with open(fpath, 'rb') as f:
            computed_hash = compute_hash(f, xxh128())
        with open(hashfile, 'w', encoding='utf-8') as f:
            f.write(computed_hash)
        logger.info('Done!')
    else:
        with open(fpath, 'rb') as f:
            computed_hash = compute_hash(f, xxh128())
        if computed_hash != original_hash:
            logger.info('Original model has changed. Regenerating FP16 model...')
            model = convert_fp16(onnx.load(fpath))
            onnx.save(model, fp16_fpath)
            with open(hashfile, 'w', encoding='utf-8') as f:
                f.write(computed_hash)
            logger.info('Done!')
        else:
            model = onnx.load(fp16_fpath)
    return model


def convert_fp16(model: ModelProto) -> ModelProto:
    model_fp16 = convert_float_to_float16(model)
    wrapped_fp16_model = OnnxModel(model_fp16)
    fusion_utils = FusionUtils(wrapped_fp16_model)
    fusion_utils.remove_cascaded_cast_nodes()
    fusion_utils.remove_useless_cast_nodes()
    wrapped_fp16_model.topological_sort()
    return wrapped_fp16_model.model


def safe_creation(model_or_path, sess_options=None, providers=None, provider_options=None):
    """
    安全创建 onnxruntime.InferenceSession，捕获 CoreML 等 ExecutionProvider 初始化引发的底层 MIL 编译失败（如-14错误），
    并自动降级回退到 CPUExecutionProvider，确保服务不闪退/不卡死。
    """
    import onnxruntime
    
    providers_list = list(providers) if providers is not None else None
    provider_options_list = list(provider_options) if provider_options is not None else None
    
    try:
        if providers_list is not None:
            return onnxruntime.InferenceSession(
                model_or_path,
                sess_options=sess_options,
                providers=providers_list,
                provider_options=provider_options_list
            )
        else:
            return onnxruntime.InferenceSession(model_or_path, sess_options=sess_options)
    except Exception as e:
        logger.warning(f"[safe_creation] 无法使用指定的 providers {providers_list} 创建会话。错误: {e}")
        
        # 如果请求了 CoreMLExecutionProvider，则剔除它重试
        if providers_list and "CoreMLExecutionProvider" in providers_list:
            logger.info("[safe_creation] 检测到 CoreMLExecutionProvider 初始化失败，正在尝试将其移除并重新加载...")
            new_providers = []
            new_options = []
            for i, p in enumerate(providers_list):
                if p != "CoreMLExecutionProvider":
                    new_providers.append(p)
                    if provider_options_list and i < len(provider_options_list):
                        new_options.append(provider_options_list[i])
            
            if "CPUExecutionProvider" not in new_providers:
                new_providers.append("CPUExecutionProvider")
                if provider_options_list:
                    new_options.append({})
            
            try:
                if provider_options_list:
                    return onnxruntime.InferenceSession(
                        model_or_path,
                        sess_options=sess_options,
                        providers=new_providers,
                        provider_options=new_options
                    )
                else:
                    return onnxruntime.InferenceSession(
                        model_or_path,
                        sess_options=sess_options,
                        providers=new_providers
                    )
            except Exception as e_retry:
                logger.warning(f"[safe_creation] 剔除 CoreML 后的重试再次失败: {e_retry}。将使用纯 CPU 模式加载。")
        
        # 终极保底机制：仅使用纯 CPUExecutionProvider 加载会话，确保服务不会崩溃
        try:
            logger.info("[safe_creation] 正在使用纯 CPUExecutionProvider 进行终极回退加载...")
            return onnxruntime.InferenceSession(
                model_or_path,
                sess_options=sess_options,
                providers=["CPUExecutionProvider"]
            )
        except Exception as e_final:
            logger.error(f"[safe_creation] 终极 CPU 回退加载失败: {e_final}")
            raise e_final

