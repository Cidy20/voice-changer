import torch
from voice_changer.common.OnnxLoader import load_onnx_model, safe_creation
from voice_changer.common.deviceManager.DeviceManager import DeviceManager
from voice_changer.embedder.Embedder import Embedder
import onnxruntime
import numpy as np

class OnnxEmbedder(Embedder):

    def load_model(self, file: str) -> Embedder:
        device_manager = DeviceManager.get_instance()
        # Force FP32 for the ONNX Embedder to bypass new ORT optimization bugs in FP16 ONNX graphs
        self.is_half = False
        (
            onnxProviders,
            onnxProviderOptions,
        ) = device_manager.get_onnx_execution_provider(require_static=True)

        model = load_onnx_model(file, self.is_half, device_manager.is_int8_avalable())

        so = onnxruntime.SessionOptions()
        # so.log_severity_level = 3
        # so.enable_profiling = True
        # so.add_free_dimension_override_by_name('audio_dynamic_axes_1', 45600)
        self.fp_dtype_t = torch.float16 if self.is_half else torch.float32
        self.fp_dtype_np = np.float16 if self.is_half else np.float32
        self.onnx_session = safe_creation(model.SerializeToString(), sess_options=so, providers=onnxProviders, provider_options=onnxProviderOptions)
        self.backend = device_manager.device_metadata.get('backend', 'cpu')
        super().set_props(self.embedderType, file)
        return self

    def extract_features(
        self, feats: torch.Tensor, embOutputLayer=9, useFinalProj=True
    ) -> torch.Tensor:
        # Keep input tensor type match with model type (which is FP32)
        input_feats = feats.float()

        if self.backend == 'cuda' and input_feats.device.type == 'cuda':
            binding = self.onnx_session.io_binding()

            binding.bind_input('audio', device_type='cuda', device_id=input_feats.device.index, element_type=self.fp_dtype_np, shape=tuple(input_feats.shape), buffer_ptr=input_feats.data_ptr())
            for output in self.onnx_session.get_outputs():
                binding.bind_output(output.name, device_type='cuda', device_id=input_feats.device.index)

            self.onnx_session.run_with_iobinding(binding)

            units = [output.numpy() for output in binding.get_outputs()]
        else:
            units = self.onnx_session.run(
                ['units9', 'unit12', 'unit12s'],
                { 'audio': input_feats.detach().cpu().numpy() }
            )
        # self.onnx_session.end_profiling()

        # Cast outputs back to the RVC pipeline's precision (which might be FP16)
        return torch.as_tensor(
            units[0] if embOutputLayer == 9 else units[1],
            dtype=feats.dtype,
        ).to(feats.device)
