import base64
import binascii
import io
import re

import modal

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"
MODEL_REVISION = "5426e4f0f36572d16453bbda7a8389317b1bef99"


def decode_photo(value: str):
    from PIL import Image, ImageOps, UnidentifiedImageError

    if not isinstance(value, str) or len(value) > 5_000_000 or not re.fullmatch(r"data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}", value):
        raise ValueError("Provide a JPG, PNG, or WebP data URI under 5 MB.")
    try:
        payload = base64.b64decode(value.split(",", 1)[1], validate=True)
        with Image.open(io.BytesIO(payload)) as image:
            if image.width * image.height > 16_000_000:
                raise ValueError("Photo exceeds 16 megapixels.")
            if image.format not in ("JPEG", "PNG", "WEBP"):
                raise ValueError("Unsupported image format.")
            image.load()
            result = ImageOps.exif_transpose(image).convert("RGB")
            result.thumbnail((1536, 1536))
            return result
    except (binascii.Error, UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError("Photo could not be decoded.") from error


def encode_depth(values) -> str:
    import numpy as np
    from PIL import Image

    values = np.nan_to_num(values, nan=0, posinf=0, neginf=0)
    low, high = float(values.min()), float(values.max())
    normalized = np.zeros_like(values, dtype=np.uint8) if high == low else ((values - low) / (high - low) * 255).astype(np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(normalized).save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def cache_model():
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    AutoImageProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
    AutoModelForDepthEstimation.from_pretrained(MODEL_ID, revision=MODEL_REVISION, use_safetensors=True)


app = modal.App("memory-spatial-photos")
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("torch==2.8.0", "torchvision==0.23.0", "transformers==4.57.3", "Pillow==12.0.0", "numpy==2.3.5", "fastapi==0.121.3")
    .run_function(cache_model)
)


@app.cls(image=image, gpu="L4", max_containers=1, scaledown_window=60, timeout=150)
class SpatialPhoto:
    @modal.enter()
    def load(self):
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation

        self.processor = AutoImageProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION, local_files_only=True)
        self.model = AutoModelForDepthEstimation.from_pretrained(MODEL_ID, revision=MODEL_REVISION, local_files_only=True, use_safetensors=True).to("cuda").eval()

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def infer(self, item: dict):
        import torch
        from fastapi import HTTPException

        try:
            photo = decode_photo(item.get("image"))
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        inputs = self.processor(images=photo, return_tensors="pt").to("cuda")
        with torch.inference_mode():
            output = self.model(**inputs)
            depth = self.processor.post_process_depth_estimation(output, target_sizes=[(photo.height, photo.width)])[0]["predicted_depth"]
        return {"depth": encode_depth(depth.cpu().numpy()), "model": MODEL_ID, "width": photo.width, "height": photo.height}
