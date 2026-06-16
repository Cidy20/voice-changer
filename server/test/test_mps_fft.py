import torch
import os
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '0'

device = torch.device('mps')

try:
    with torch.no_grad():
        x = torch.randn(1, 1024, device=device)
        y = torch.fft.rfft(x)
        z = torch.fft.irfft(y)
    print("FFT PASSED")
except Exception as e:
    print("FFT FAILED:", e)

