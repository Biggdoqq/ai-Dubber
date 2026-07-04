"""
Video Effects Module for AI Video Dubber
Provides various video effects using OpenCV and FFmpeg
"""

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import subprocess
import os
import tempfile
import shutil
from datetime import datetime


class VideoEffect:
    """Base class for video effects"""
    
    def __init__(self, name, description=""):
        self.name = name
        self.description = description
    
    def apply(self, frame):
        """Apply effect to a single frame. Override in subclass."""
        raise NotImplementedError


class ColorEffect(VideoEffect):
    """Color adjustment effects"""
    
    def __init__(self, brightness=1.0, contrast=1.0, saturation=1.0, hue_shift=0):
        super().__init__("Color Adjustment", "Adjust brightness, contrast, saturation, and hue")
        self.brightness = brightness
        self.contrast = contrast
        self.saturation = saturation
        self.hue_shift = hue_shift
    
    def apply(self, frame):
        # Convert to float32
        frame_float = frame.astype(np.float32)
        
        # Apply brightness
        frame_float = frame_float * self.brightness
        
        # Apply contrast
        frame_float = ((frame_float - 128) * self.contrast) + 128
        
        # Clip values
        frame_float = np.clip(frame_float, 0, 255)
        
        # Convert back to uint8
        result = frame_float.astype(np.uint8)
        
        # Apply saturation using HSV
        if self.saturation != 1.0:
            hsv = cv2.cvtColor(result, cv2.COLOR_BGR2HSV)
            hsv_float = hsv.astype(np.float32)
            hsv_float[:, :, 1] = hsv_float[:, :, 1] * self.saturation
            hsv_float[:, :, 1] = np.clip(hsv_float[:, :, 1], 0, 255)
            hsv = hsv_float.astype(np.uint8)
            result = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
        
        # Apply hue shift
        if self.hue_shift != 0:
            hsv = cv2.cvtColor(result, cv2.COLOR_BGR2HSV)
            hsv[:, :, 0] = (hsv[:, :, 0] + self.hue_shift) % 180
            result = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
        
        return result


class FilterEffect(VideoEffect):
    """Preset filter effects"""
    
    def __init__(self, filter_type):
        super().__init__(f"Filter: {filter_type}", f"Apply {filter_type} filter")
        self.filter_type = filter_type
    
    def apply(self, frame):
        if self.filter_type == "grayscale":
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        
        elif self.filter_type == "sepia":
            # Sepia tone matrix
            sepia_matrix = np.array([
                [0.393, 0.769, 0.189],
                [0.349, 0.686, 0.168],
                [0.272, 0.534, 0.131]
            ])
            frame_float = frame.astype(np.float64)
            sepia = cv2.transform(frame_float, sepia_matrix)
            sepia = np.clip(sepia, 0, 255).astype(np.uint8)
            return sepia
        
        elif self.filter_type == "vintage":
            # Vintage film look
            result = frame.copy()
            # Warm tones
            result[:, :, 2] = np.clip(result[:, :, 2] * 1.2, 0, 255)  # Increase red
            result[:, :, 0] = np.clip(result[:, :, 0] * 0.8, 0, 255)  # Decrease blue
            # Add slight grain
            noise = np.random.normal(0, 15, result.shape).astype(np.int16)
            result = np.clip(result.astype(np.int16) + noise, 0, 255).astype(np.uint8)
            return result
        
        elif self.filter_type == "cinematic":
            # Cinematic widescreen look
            result = frame.copy()
            # Increase contrast
            result = cv2.convertScaleAbs(result, alpha=1.3, beta=-10)
            # Add slight vignette
            result = self._add_vignette(result, intensity=0.3)
            # Warm color grading
            result[:, :, 0] = np.clip(result[:, :, 0] * 0.9, 0, 255)  # Shadows blue
            result[:, :, 2] = np.clip(result[:, :, 2] * 1.1, 0, 255)  # Highlights warm
            return result
        
        elif self.filter_type == "cool":
            # Cool blue tones
            result = frame.copy()
            result[:, :, 0] = np.clip(result[:, :, 0] * 1.2, 0, 255)  # Increase blue
            result[:, :, 1] = np.clip(result[:, :, 1] * 0.9, 0, 255)  # Slightly decrease green
            result[:, :, 2] = np.clip(result[:, :, 2] * 0.8, 0, 255)  # Decrease red
            return result
        
        elif self.filter_type == "warm":
            # Warm golden tones
            result = frame.copy()
            result[:, :, 0] = np.clip(result[:, :, 0] * 0.8, 0, 255)  # Decrease blue
            result[:, :, 1] = np.clip(result[:, :, 1] * 1.1, 0, 255)  # Slightly increase green
            result[:, :, 2] = np.clip(result[:, :, 2] * 1.3, 0, 255)  # Increase red
            return result
        
        elif self.filter_type == "noir":
            # Black and white with high contrast
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # High contrast
            gray = cv2.convertScaleAbs(gray, alpha=1.5, beta=-20)
            # Add film grain
            noise = np.random.normal(0, 20, gray.shape).astype(np.int16)
            gray = np.clip(gray.astype(np.int16) + noise, 0, 255).astype(np.uint8)
            return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        
        elif self.filter_type == "dreamy":
            # Soft, dreamy look
            blurred = cv2.GaussianBlur(frame, (0, 0), sigmaX=15)
            result = cv2.addWeighted(frame, 0.7, blurred, 0.3, 0)
            # Slight brightness increase
            result = cv2.convertScaleAbs(result, alpha=1.1, beta=10)
            return result
        
        elif self.filter_type == "dramatic":
            # High contrast, dramatic look
            result = frame.copy()
            # Increase contrast significantly
            result = cv2.convertScaleAbs(result, alpha=1.5, beta=-20)
            # Slight desaturation
            hsv = cv2.cvtColor(result, cv2.COLOR_BGR2HSV)
            hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 0.7, 0, 255)
            result = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
            return result
        
        else:
            return frame
    
    def _add_vignette(self, frame, intensity=0.5):
        """Add vignette effect"""
        height, width = frame.shape[:2]
        
        # Create vignette mask
        x = np.linspace(-1, 1, width)
        y = np.linspace(-1, 1, height)
        X, Y = np.meshgrid(x, y)
        radius = np.sqrt(X**2 + Y**2)
        
        # Create gradient mask
        mask = np.clip(radius * intensity, 0, 1)
        mask = 1 - mask  # Invert: dark at edges
        
        # Stack to 3 channels
        mask_3d = np.stack([mask] * 3, axis=2)
        
        # Apply mask
        result = (frame.astype(np.float32) * mask_3d).astype(np.uint8)
        return result


class BlurEffect(VideoEffect):
    """Blur and sharpen effects"""
    
    def __init__(self, blur_type, strength=5):
        super().__init__(f"Blur: {blur_type}", f"Apply {blur_type} blur")
        self.blur_type = blur_type
        self.strength = strength
    
    def apply(self, frame):
        if self.blur_type == "gaussian":
            ksize = self.strength * 2 + 1  # Must be odd
            return cv2.GaussianBlur(frame, (ksize, ksize), 0)
        
        elif self.blur_type == "box":
            ksize = self.strength * 2 + 1
            return cv2.blur(frame, (ksize, ksize))
        
        elif self.blur_type == "median":
            ksize = self.strength * 2 + 1
            return cv2.medianBlur(frame, ksize)
        
        elif self.blur_type == "bilateral":
            d = self.strength * 2 + 1
            return cv2.bilateralFilter(frame, d, 75, 75)
        
        elif self.blur_type == "motion":
            # Motion blur approximation
            kernel_size = self.strength * 2 + 1
            kernel = np.zeros((kernel_size, kernel_size))
            kernel[int((kernel_size - 1) / 2), :] = np.ones(kernel_size)
            kernel = kernel / kernel_size
            return cv2.filter2D(frame, -1, kernel)
        
        elif self.blur_type == "sharpen":
            # Sharpening kernel
            strength = min(self.strength / 5.0, 2.0)
            kernel = np.array([
                [0, -1, 0],
                [-1, 5 + strength, -1],
                [0, -1, 0]
            ])
            return cv2.filter2D(frame, -1, kernel)
        
        else:
            return frame


class OverlayEffect(VideoEffect):
    """Add overlays like text, images, or watermarks"""
    
    def __init__(self, overlay_type, text="", position="bottom-right", font_size=1, color=(255, 255, 255), opacity=0.7):
        super().__init__(f"Overlay: {overlay_type}", f"Add {overlay_type} overlay")
        self.overlay_type = overlay_type
        self.text = text
        self.position = position
        self.font_size = font_size
        self.color = color
        self.opacity = opacity
    
    def apply(self, frame):
        if self.overlay_type == "text":
            return self._add_text(frame)
        elif self.overlay_type == "watermark":
            return self._add_watermark(frame)
        elif self.overlay_type == "timestamp":
            return self._add_timestamp(frame)
        else:
            return frame
    
    def _add_text(self, frame):
        """Add text overlay"""
        overlay = frame.copy()
        height, width = frame.shape[:2]
        
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = self.font_size
        thickness = 2
        
        # Get text size
        (text_width, text_height), baseline = cv2.getTextSize(
            self.text, font, font_scale, thickness
        )
        
        # Position text
        margin = 20
        if "top" in self.position:
            y = text_height + margin
        else:  # bottom
            y = height - margin
        
        if "left" in self.position:
            x = margin
        elif "center" in self.position:
            x = (width - text_width) // 2
        else:  # right
            x = width - text_width - margin
        
        # Draw text with shadow
        shadow_offset = 2
        cv2.putText(overlay, self.text, (x + shadow_offset, y + shadow_offset),
                   font, font_scale, (0, 0, 0), thickness + 1)
        cv2.putText(overlay, self.text, (x, y),
                   font, font_scale, self.color, thickness)
        
        # Blend with original
        return cv2.addWeighted(overlay, self.opacity, frame, 1 - self.opacity, 0)
    
    def _add_watermark(self, frame):
        """Add watermark text"""
        overlay = frame.copy()
        height, width = frame.shape[:2]
        
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.8
        thickness = 2
        text = "AI Dubber" if not self.text else self.text
        
        (text_width, text_height), baseline = cv2.getTextSize(
            text, font, font_scale, thickness
        )
        
        # Position at bottom-right by default
        x = width - text_width - 20
        y = height - 20
        
        # Semi-transparent background
        bg_padding = 10
        cv2.rectangle(overlay, 
                     (x - bg_padding, y - text_height - bg_padding),
                     (x + text_width + bg_padding, y + baseline + bg_padding),
                     (0, 0, 0), -1)
        
        # Draw text
        cv2.putText(overlay, text, (x, y),
                   font, font_scale, (255, 255, 255), thickness)
        
        return cv2.addWeighted(overlay, 0.5, frame, 0.5, 0)
    
    def _add_timestamp(self, frame):
        """Add timestamp"""
        overlay = frame.copy()
        height, width = frame.shape[:2]
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        text = f"Timestamp: {timestamp}" if not self.text else timestamp
        
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.6
        thickness = 1
        
        (text_width, text_height), baseline = cv2.getTextSize(
            text, font, font_scale, thickness
        )
        
        x = 10
        y = 20
        
        # Draw text with background
        cv2.rectangle(overlay, (x - 5, y - text_height - 5),
                     (x + text_width + 5, y + baseline + 5),
                     (0, 0, 0), -1)
        cv2.putText(overlay, text, (x, y),
                   font, font_scale, (0, 255, 0), thickness)
        
        return cv2.addWeighted(overlay, 0.7, frame, 0.3, 0)


class TransformEffect(VideoEffect):
    """Geometric transformations"""
    
    def __init__(self, transform_type, value=0):
        super().__init__(f"Transform: {transform_type}", f"Apply {transform_type} transform")
        self.transform_type = transform_type
        self.value = value
    
    def apply(self, frame):
        height, width = frame.shape[:2]
        
        if self.transform_type == "rotate":
            center = (width // 2, height // 2)
            matrix = cv2.getRotationMatrix2D(center, self.value, 1.0)
            return cv2.warpAffine(frame, matrix, (width, height))
        
        elif self.transform_type == "scale":
            scale = self.value
            new_width = int(width * scale)
            new_height = int(height * scale)
            resized = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_LINEAR)
            
            # Crop or pad to original size
            if scale > 1:
                # Crop
                x_start = (new_width - width) // 2
                y_start = (new_height - height) // 2
                return resized[y_start:y_start+height, x_start:x_start+width]
            else:
                # Pad
                result = np.zeros((height, width, 3), dtype=np.uint8)
                x_start = (width - new_width) // 2
                y_start = (height - new_height) // 2
                result[y_start:y_start+new_height, x_start:x_start+new_width] = resized
                return result
        
        elif self.transform_type == "flip_horizontal":
            return cv2.flip(frame, 1)
        
        elif self.transform_type == "flip_vertical":
            return cv2.flip(frame, 0)
        
        else:
            return frame


class VignetteEffect(VideoEffect):
    """Vignette effect for cinematic look"""
    
    def __init__(self, intensity=0.5, roundness=1.0):
        super().__init__("Vignette", "Add vignette effect")
        self.intensity = intensity
        self.roundness = roundness
    
    def apply(self, frame):
        height, width = frame.shape[:2]
        
        # Create vignette mask
        x = np.linspace(-1, 1, width)
        y = np.linspace(-1, 1, height)
        X, Y = np.meshgrid(x, y)
        
        # Calculate distance from center with roundness
        radius = (X**2 + Y**2) ** (1.0 / self.roundness)
        
        # Create gradient
        mask = np.clip(radius * self.intensity * 2, 0, 1)
        mask = 1 - mask
        
        # Ensure center is white
        mask = np.maximum(mask, 0)
        
        # Apply to all channels
        mask_3d = np.stack([mask] * 3, axis=2)
        
        # Blend
        result = (frame.astype(np.float32) * mask_3d).astype(np.uint8)
        return result


class GlitchEffect(VideoEffect):
    """Digital glitch effect"""
    
    def __init__(self, intensity=0.1, speed=1):
        super().__init__("Glitch", "Add digital glitch effect")
        self.intensity = intensity
        self.speed = speed
        self.frame_count = 0
    
    def apply(self, frame):
        self.frame_count += 1
        
        if self.frame_count % (self.speed * 10) != 0:
            return frame
        
        height, width = frame.shape[:2]
        result = frame.copy()
        
        # Random horizontal slices
        num_slices = int(self.intensity * 20)
        for _ in range(num_slices):
            y = np.random.randint(0, height)
            slice_height = np.random.randint(5, 30)
            shift = np.random.randint(-50, 50)
            
            y_end = min(y + slice_height, height)
            x_start = max(0, shift)
            x_end = min(width, width + shift)
            
            if shift > 0:
                result[y:y_end, x_start:width] = frame[y:y_end, 0:width-x_start]
            else:
                result[y:y_end, 0:x_end] = frame[y:y_end, abs(shift):width]
        
        # RGB channel shift
        shift_amount = int(self.intensity * 20)
        if shift_amount > 0:
            result[:, :, 0] = np.roll(result[:, :, 0], shift_amount, axis=1)
            result[:, :, 2] = np.roll(result[:, :, 2], -shift_amount, axis=1)
        
        return result


class FilmGrainEffect(VideoEffect):
    """Add film grain"""
    
    def __init__(self, intensity=0.3, size=1):
        super().__init__("Film Grain", "Add analog film grain")
        self.intensity = intensity
        self.size = size
    
    def apply(self, frame):
        # Create grain
        height, width = frame.shape[:2]
        
        if self.size > 1:
            # Larger grain
            small_height, small_width = height // self.size, width // self.size
            grain = np.random.normal(0, 1, (small_height, small_width)).astype(np.float32)
            grain = cv2.resize(grain, (width, height), interpolation=cv2.INTER_LINEAR)
        else:
            grain = np.random.normal(0, 1, (height, width)).astype(np.float32)
        
        # Normalize grain to 0-255
        grain = ((grain - grain.min()) / (grain.max() - grain.min())) * 255
        grain = grain.astype(np.uint8)
        
        # Convert to 3 channels
        grain_3d = cv2.cvtColor(grain, cv2.COLOR_GRAY2BGR)
        
        # Blend with original
        alpha = self.intensity
        result = cv2.addWeighted(frame, 1 - alpha, grain_3d, alpha, 0)
        
        return result


class LetterboxEffect(VideoEffect):
    """Add cinematic letterbox bars"""
    
    def __init__(self, aspect_ratio=2.35, bar_color=(0, 0, 0)):
        super().__init__("Letterbox", "Add cinematic black bars")
        self.aspect_ratio = aspect_ratio
        self.bar_color = bar_color
    
    def apply(self, frame):
        height, width = frame.shape[:2]
        current_aspect = width / height
        
        result = frame.copy()
        
        if current_aspect < self.aspect_ratio:
            # Add bars to top and bottom
            target_width = int(height * self.aspect_ratio)
            bar_width = (target_width - width) // 2
            
            # Create new frame with bars
            new_frame = np.full((height, target_width, 3), self.bar_color, dtype=np.uint8)
            new_frame[:, bar_width:bar_width+width] = frame
            result = new_frame
        else:
            # Add bars to sides
            target_height = int(width / self.aspect_ratio)
            bar_height = (height - target_height) // 2
            
            # Create new frame with bars
            new_frame = np.full((target_height, width, 3), self.bar_color, dtype=np.uint8)
            result = frame[bar_height:bar_height+target_height, :]
        
        return result


class AutoTextBlurEffect(VideoEffect):
    """Auto-detect and blur text/title regions in video"""
    
    def __init__(self, blur_strength=15, sensitivity=0.7, region="full"):
        """
        Args:
            blur_strength: How much to blur (5-50)
            sensitivity: Detection sensitivity 0.0-1.0 (higher = more sensitive)
            region: Where to look for text - "full", "bottom", "top", "center"
        """
        super().__init__("Auto Text Blur", "Auto-detect and blur text/titles")
        self.blur_strength = blur_strength
        self.sensitivity = sensitivity
        self.region = region
        self.prev_regions = []  # Cache detected regions for temporal consistency
    
    def detect_text_regions(self, frame):
        """Detect text-like regions in frame using edge detection and morphological operations"""
        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            gray = frame.copy()
        
        height, width = gray.shape
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Use Canny edge detection
        # Adjust thresholds based on sensitivity
        low_thresh = int(50 * (1.0 - self.sensitivity))
        high_thresh = int(150 * (1.0 - self.sensitivity) + 100)
        edges = cv2.Canny(blurred, low_thresh, high_thresh)
        
        # Dilate edges to connect text components
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        dilated = cv2.dilate(edges, kernel, iterations=2)
        
        # Find contours
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Filter contours that look like text
        text_regions = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            
            # Filter by aspect ratio (text is usually wider than tall)
            aspect_ratio = w / h if h > 0 else 0
            if aspect_ratio < 0.5 or aspect_ratio > 15:
                continue
            
            # Filter by size (too small or too large)
            area = w * h
            frame_area = width * height
            if area < 100 or area > frame_area * 0.5:
                continue
            
            # Filter by position based on region setting
            if self.region == "bottom" and y > height * 0.6:
                text_regions.append((x, y, w, h))
            elif self.region == "top" and y < height * 0.4:
                text_regions.append((x, y, w, h))
            elif self.region == "center" and height * 0.2 < y < height * 0.8:
                text_regions.append((x, y, w, h))
            elif self.region == "full":
                text_regions.append((x, y, w, h))
        
        # Merge overlapping regions
        text_regions = self._merge_regions(text_regions)
        
        return text_regions
    
    def _merge_regions(self, regions):
        """Merge overlapping or nearby regions"""
        if not regions:
            return []
        
        # Sort by x position
        regions = sorted(regions, key=lambda r: r[0])
        
        merged = [regions[0]]
        
        for current in regions[1:]:
            last = merged[-1]
            # Check if regions overlap or are close
            if (current[0] < last[0] + last[2] + 10 and
                current[1] < last[1] + last[3] + 10):
                # Merge regions
                x = min(last[0], current[0])
                y = min(last[1], current[1])
                w = max(last[0] + last[2], current[0] + current[2]) - x
                h = max(last[1] + last[3], current[1] + current[3]) - y
                merged[-1] = (x, y, w, h)
            else:
                merged.append(current)
        
        return merged
    
    def apply(self, frame):
        """Apply auto text blur to frame"""
        # Detect text regions
        regions = self.detect_text_regions(frame)
        
        # If no regions found, return original
        if not regions:
            return frame
        
        # Create blurred version of frame
        ksize = self.blur_strength * 2 + 1
        blurred_frame = cv2.GaussianBlur(frame, (ksize, ksize), 0)
        
        # Create mask for text regions
        mask = np.zeros(frame.shape[:2], dtype=np.uint8)
        for (x, y, w, h) in regions:
            # Add padding around regions
            padding = 5
            x = max(0, x - padding)
            y = max(0, y - padding)
            w = min(frame.shape[1] - x, w + padding * 2)
            h = min(frame.shape[0] - y, h + padding * 2)
            mask[y:y+h, x:x+w] = 255
        
        # Dilate mask slightly for smoother edges
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.dilate(mask, kernel, iterations=2)
        
        # Blur the mask for smooth transitions
        mask = cv2.GaussianBlur(mask, (15, 15), 5)
        
        # Blend original and blurred using mask
        mask_3d = np.stack([mask, mask, mask], axis=2).astype(np.float32) / 255.0
        result = (frame.astype(np.float32) * (1 - mask_3d) + 
                  blurred_frame.astype(np.float32) * mask_3d)
        
        return result.astype(np.uint8)


class EffectProcessor:
    """Process video with effects using FFmpeg"""
    
    def __init__(self, progress_callback=None):
        self.progress_callback = progress_callback
    
    def apply_ffmpeg_effect(self, input_video, output_video, effect_name, **params):
        """Apply effects using FFmpeg"""
        
        if effect_name == "brightness":
            value = params.get('value', 0)  # -1.0 to 1.0
            vf = f"eq=brightness={value}"
        
        elif effect_name == "contrast":
            value = params.get('value', 1.0)  # 0.0 to 2.0
            vf = f"eq=contrast={value}"
        
        elif effect_name == "saturation":
            value = params.get('value', 1.0)  # 0.0 to 3.0
            vf = f"eq=saturation={value}"
        
        elif effect_name == "hue":
            value = params.get('value', 0)  # -180 to 180
            vf = f"hue=h={value}"
        
        elif effect_name == "blur":
            value = params.get('value', 5)  # 1 to 50
            vf = f"boxblur={value}:1"
        
        elif effect_name == "sharpen":
            value = params.get('value', 1.0)  # 0.0 to 5.0
            vf = f"unsharp=5:5:{value}:5:5:0"
        
        elif effect_name == "vignette":
            value = params.get('value', 0.5)  # 0.0 to 1.0
            vf = f"vignette=PI/4*{value}"
        
        elif effect_name == "invert":
            vf = "negate"
        
        elif effect_name == "edge_detect":
            vf = "edgedetect=low=0.1:high=0.4"
        
        elif effect_name == "old_film":
            vf = f"eq=contrast=1.2:brightness=0.1:saturation=0.8,format=gray,format=yuv420p,vignette=PI/4*0.5"
        
        elif effect_name == "speed":
            value = params.get('value', 1.0)  # 0.25 to 4.0
            # Speed up or slow down
            pts_value = 1.0 / value
            vf = f"setpts={pts_value}*PTS"
            audio_filter = f"atempo={value}"
            
            cmd = [
                'ffmpeg', '-y', '-i', input_video,
                '-vf', vf,
                '-af', audio_filter,
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-c:a', 'aac',
                output_video
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg failed: {result.stderr[:500]}")
            return output_video
        
        elif effect_name == "reverse":
            vf = "reverse"
            cmd = [
                'ffmpeg', '-y', '-i', input_video,
                '-vf', vf,
                '-af', 'areverse',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-c:a', 'aac',
                output_video
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg failed: {result.stderr[:500]}")
            return output_video
        
        else:
            raise ValueError(f"Unknown effect: {effect_name}")
        
        # Standard FFmpeg command with video filter
        cmd = [
            'ffmpeg', '-y', '-i', input_video,
            '-vf', vf,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-c:a', 'copy',
            output_video
        ]
        
        if self.progress_callback:
            self.progress_callback(10, "Processing video with FFmpeg...")
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"❌ FFmpeg error:\n{result.stderr[:500]}")
            raise RuntimeError(f"FFmpeg failed: {result.stderr[:500]}")
        
        if self.progress_callback:
            self.progress_callback(100, "Effect applied successfully!")
        
        return output_video
    
    def apply_opencv_effects(self, input_video, output_video, effects, fps=None, progress_callback=None):
        """Apply OpenCV-based effects to video"""
        
        cap = cv2.VideoCapture(input_video)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {input_video}")
        
        # Get video properties
        if fps is None:
            fps = cap.get(cv2.CAP_PROP_FPS)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Create temp output
        temp_output = output_video + ".temp.avi"
        fourcc = cv2.VideoWriter_fourcc(*'XVID')
        out = cv2.VideoWriter(temp_output, fourcc, fps, (width, height))
        
        if progress_callback:
            progress_callback(5, "Processing frames...")
        
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Apply all effects in sequence
            result_frame = frame.copy()
            for effect in effects:
                result_frame = effect.apply(result_frame)
            
            out.write(result_frame)
            frame_idx += 1
            
            # Update progress
            if progress_callback and frame_idx % 10 == 0:
                progress = 5 + int((frame_idx / total_frames) * 70)
                progress_callback(progress, f"Processing frame {frame_idx}/{total_frames}...")
        
        cap.release()
        out.release()
        
        if progress_callback:
            progress_callback(80, "Encoding final video...")
        
        # Re-encode with audio using FFmpeg
        cmd = [
            'ffmpeg', '-y', '-i', input_video, '-i', temp_output,
            '-map', '0:a?', '-map', '1:v',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-c:a', 'aac',
            output_video
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Clean up temp file
        if os.path.exists(temp_output):
            os.remove(temp_output)
        
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg encoding failed: {result.stderr[:500]}")
        
        if progress_callback:
            progress_callback(100, "Effect applied successfully!")
        
        return output_video


# ========== Effect Presets ==========

EFFECT_PRESETS = {
    "Auto Blur Text/Titles": [
        AutoTextBlurEffect(blur_strength=15, sensitivity=0.7, region="full"),
    ],
    "Auto Blur Subtitles (Bottom)": [
        AutoTextBlurEffect(blur_strength=15, sensitivity=0.8, region="bottom"),
    ],
    "Cinematic Warm": [
        ColorEffect(brightness=1.05, contrast=1.15, saturation=0.9),
        VignetteEffect(intensity=0.4),
    ],
    "Cinematic Cool": [
        ColorEffect(brightness=0.95, contrast=1.2, saturation=0.85),
        FilterEffect("cool"),
        VignetteEffect(intensity=0.5),
    ],
    "Vintage Film": [
        FilterEffect("vintage"),
        FilmGrainEffect(intensity=0.3, size=2),
        VignetteEffect(intensity=0.6),
        LetterboxEffect(aspect_ratio=2.35),
    ],
    "Noir": [
        FilterEffect("noir"),
        VignetteEffect(intensity=0.7),
        LetterboxEffect(aspect_ratio=2.35),
    ],
    "Dreamy": [
        FilterEffect("dreamy"),
        ColorEffect(brightness=1.1, contrast=0.95, saturation=1.1),
    ],
    "Dramatic": [
        FilterEffect("dramatic"),
        VignetteEffect(intensity=0.6),
    ],
    "Sepia Classic": [
        FilterEffect("sepia"),
        FilmGrainEffect(intensity=0.2),
    ],
    "Glitch Art": [
        GlitchEffect(intensity=0.15, speed=2),
        ColorEffect(brightness=1.1, contrast=1.2),
    ],
    "Sharp & Clear": [
        BlurEffect("sharpen", strength=3),
        ColorEffect(contrast=1.1, saturation=1.1),
    ],
    "Soft Focus": [
        FilterEffect("dreamy"),
        BlurEffect("gaussian", strength=2),
    ],
}

# FFmpeg effects list
FFMPEG_EFFECTS = {
    "Brightness": {"name": "brightness", "min": -1.0, "max": 1.0, "default": 0.0, "unit": ""},
    "Contrast": {"name": "contrast", "min": 0.0, "max": 2.0, "default": 1.0, "unit": "x"},
    "Saturation": {"name": "saturation", "min": 0.0, "max": 3.0, "default": 1.0, "unit": "x"},
    "Hue": {"name": "hue", "min": -180, "max": 180, "default": 0, "unit": "°"},
    "Blur": {"name": "blur", "min": 1, "max": 50, "default": 5, "unit": "px"},
    "Sharpen": {"name": "sharpen", "min": 0.0, "max": 5.0, "default": 1.0, "unit": "x"},
    "Vignette": {"name": "vignette", "min": 0.0, "max": 1.0, "default": 0.5, "unit": ""},
    "Invert Colors": {"name": "invert"},
    "Edge Detect": {"name": "edge_detect"},
    "Old Film": {"name": "old_film"},
    "Speed": {"name": "speed", "min": 0.25, "max": 4.0, "default": 1.0, "unit": "x"},
    "Reverse": {"name": "reverse"},
}


def get_available_effects():
    """Get list of all available effects"""
    return {
        "OpenCV Presets": list(EFFECT_PRESETS.keys()),
        "FFmpeg Effects": list(FFMPEG_EFFECTS.keys()),
    }


def apply_effect_to_video(input_video, output_video, effect_name, value=1.0, 
                         progress_callback=None, **kwargs):
    """Convenience function to apply effect to video"""
    
    processor = EffectProcessor(progress_callback)
    
    # Check if it's an OpenCV preset
    if effect_name in EFFECT_PRESETS:
        effects = EFFECT_PRESETS[effect_name]
        return processor.apply_opencv_effects(
            input_video, output_video, effects, 
            progress_callback=progress_callback
        )
    
    # Otherwise, use FFmpeg effect
    if effect_name in FFMPEG_EFFECTS:
        effect_info = FFMPEG_EFFECTS[effect_name]
        effect_params = {"value": value, **kwargs}
        return processor.apply_ffmpeg_effect(
            input_video, output_video, effect_info["name"], 
            **effect_params
        )
    
    raise ValueError(f"Unknown effect: {effect_name}. Available: {get_available_effects()}")


if __name__ == "__main__":
    print("=" * 60)
    print("AI Video Dubber - Effect Module")
    print("=" * 60)
    print("\nAvailable Effects:")
    print("\n📹 OpenCV Presets:")
    for name in EFFECT_PRESETS.keys():
        print(f"  • {name}")
    
    print("\n🎬 FFmpeg Effects:")
    for name, info in FFMPEG_EFFECTS.items():
        if "min" in info:
            print(f"  • {name} ({info['min']}-{info['max']}{info['unit']})")
        else:
            print(f"  • {name}")
    
    print("\n" + "=" * 60)
    print("Example usage:")
    print("=" * 60)
    print("""
from Effect import apply_effect_to_video

# Apply cinematic warm preset
apply_effect_to_video(
    input_video="input.mp4",
    output_video="output.mp4",
    effect_name="Cinematic Warm",
    progress_callback=lambda p, m: print(f"{p}% - {m}")
)

# Apply brightness with FFmpeg
apply_effect_to_video(
    input_video="input.mp4",
    output_video="bright.mp4",
    effect_name="Brightness",
    value=0.3
)
    """)
