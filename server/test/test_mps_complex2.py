import torch
import os
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '0'

device = torch.device('mps')

try:
    with torch.no_grad():
        from torchaudio.functional import resample
        a = torch.randn(1, 16000, device=device)
        b = resample(a, 16000, 48000)
    print("RESAMPLE PASSED")
except Exception as e:
    print("RESAMPLE FAILED:", e)

