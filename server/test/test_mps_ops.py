import os
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '0'
import torch
import torch.nn.functional as F

print("=== Testing MPS operators without fallback (Inference Mode) ===")
device = torch.device('mps')

@torch.no_grad()
def test_op(name, func):
    try:
        func()
        print(f"[OK] {name}")
    except Exception as e:
        print(f"[FAILED] {name}: {e}")

# 1. 1D Interpolate
@torch.no_grad()
def test_interpolate():
    x = torch.randn(1, 1, 100, device=device)
    y = F.interpolate(x, size=200, mode='linear', align_corners=False)

# 2. Reflection Pad 1D
@torch.no_grad()
def test_pad_reflect():
    x = torch.randn(1, 1, 100, device=device)
    y = F.pad(x, (2, 2), mode='reflect')

# 3. STFT & iSTFT
@torch.no_grad()
def test_stft():
    x = torch.randn(1, 1024, device=device)
    window = torch.hann_window(1024, device=device)
    stft_res = torch.stft(x, n_fft=1024, hop_length=256, win_length=1024, window=window, return_complex=True)
    y = torch.istft(stft_res, n_fft=1024, hop_length=256, win_length=1024, window=window)

# 4. Cumsum
@torch.no_grad()
def test_cumsum():
    x = torch.randn(10, device=device)
    y = torch.cumsum(x, dim=0)

test_op("1D Interpolate", test_interpolate)
test_op("1D Reflection Pad", test_pad_reflect)
test_op("STFT & iSTFT", test_stft)
test_op("Cumsum", test_cumsum)
