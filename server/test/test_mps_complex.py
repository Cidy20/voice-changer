import torch
import os
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '0'

device = torch.device('mps')

try:
    with torch.no_grad():
        # FCPE complex ops
        x = torch.randn(1, 1024, dtype=torch.cfloat, device=device)
        mag = torch.abs(x)
        phase = torch.angle(x)
        y = torch.polar(mag, phase)
        # resample
        from torchaudio.functional import resample
        a = torch.randn(1, 16000, device=device)
        b = resample(a, 16000, 48000)
    print("ALL COMPLEX AND RESAMPLE OPS PASSED")
except Exception as e:
    print("FAILED:", e)

