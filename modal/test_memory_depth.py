import base64
import io
import unittest

from memory_depth import decode_photo, encode_depth


class DepthContractTest(unittest.TestCase):
    def test_rejects_non_images_and_urls(self):
        for value in ("https://example.com/photo.jpg", "data:image/jpeg;base64,bm90LWFuLWltYWdl", "data:text/plain;base64,aGk="):
            with self.assertRaises(ValueError):
                decode_photo(value)

    def test_roundtrip_normalizes_depth_without_nan_for_flat_image(self):
        import numpy as np
        from PIL import Image

        result = encode_depth(np.ones((4, 6), dtype=np.float32))
        image = Image.open(io.BytesIO(base64.b64decode(result.split(",", 1)[1])))
        self.assertEqual(image.size, (6, 4))
        self.assertEqual(image.getextrema(), (0, 0))

    def test_decodes_valid_photo_and_rejects_oversized_dimensions(self):
        from PIL import Image

        buffer = io.BytesIO()
        Image.new("RGB", (32, 24), "green").save(buffer, format="JPEG")
        image = decode_photo("data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode())
        self.assertEqual(image.size, (32, 24))


if __name__ == "__main__":
    unittest.main()
