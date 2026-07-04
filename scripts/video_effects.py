import os
import cv2
import copy
import numpy as np
from PyQt5.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel, 
                             QPushButton, QLineEdit, QTabWidget, QWidget,
                             QFormLayout, QSpinBox, QSlider, QFileDialog, QMessageBox, QCheckBox,
                             QFrame, QGridLayout, QComboBox)
from PyQt5.QtCore import Qt, QRect
from PyQt5.QtGui import QPixmap, QFont

_LOADED_FONTS = {}

class VideoEffectsDialog(QDialog):
    def __init__(self, parent_app, input_video, colors_theme):
        from PyQt5.QtWidgets import QWidget
        if isinstance(parent_app, QWidget):
            super().__init__(parent_app)
        else:
            super().__init__()
        self.setWindowFlags(Qt.Window | Qt.WindowMinimizeButtonHint | Qt.WindowMaximizeButtonHint | Qt.WindowCloseButtonHint | Qt.WindowStaysOnTopHint)
        if hasattr(parent_app, 'windowIcon'):
            self.setWindowIcon(parent_app.windowIcon())
        self.app = parent_app
        self.input_video = input_video
        self.colors = colors_theme
        self.setWindowTitle("✨ Video Effects & Tools")
        self.resize(780, 560)
        self.setStyleSheet(f"""
            QDialog {{
                background: #050811;
                color: #ffffff;
                font-family: 'Segoe UI', 'Hanuman', 'Battambang', sans-serif;
            }}
            QLabel {{
                color: #e0f7fa;
                font-size: 13px;
            }}
            QLabel#desc_label {{
                color: #778ca3;
                font-size: 12px;
                font-style: italic;
                padding-bottom: 6px;
            }}
            QLabel#section_hdr {{
                color: #00f3ff;
                font-weight: bold;
                font-size: 13px;
                letter-spacing: 0.5px;
                padding-bottom: 4px;
            }}
            QFrame.SettingsCard {{
                background-color: #0b1122;
                border: 1px solid #162447;
                border-radius: 8px;
            }}
            QLineEdit, QSpinBox, QPlainTextEdit, QComboBox {{
                background: #0c1527;
                color: #ffffff;
                border: 1px solid #1a2a40;
                border-radius: 6px;
                padding: 6px 12px;
                font-size: 13px;
            }}
            QLineEdit:hover, QSpinBox:hover, QPlainTextEdit:hover, QComboBox:hover {{
                border: 1px solid #0088ff;
            }}
            QLineEdit:focus, QSpinBox:focus, QPlainTextEdit:focus, QComboBox:focus {{
                border: 1px solid #00f3ff;
                background: #0d1e35;
            }}
            
            /* QSpinBox Styling */
            QSpinBox::up-button {{
                subcontrol-origin: border;
                subcontrol-position: top right;
                width: 22px;
                border-left: 1px solid #1a2a40;
                border-bottom: 1px solid #1a2a40;
                background: #0f1c35;
                border-top-right-radius: 5px;
            }}
            QSpinBox::down-button {{
                subcontrol-origin: border;
                subcontrol-position: bottom right;
                width: 22px;
                border-left: 1px solid #1a2a40;
                background: #0f1c35;
                border-bottom-right-radius: 5px;
            }}
            QSpinBox::up-button:hover, QSpinBox::down-button:hover {{
                background: rgba(0, 243, 255, 0.15);
            }}
            QSpinBox::up-arrow {{
                image: none;
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-bottom: 5px solid #00f3ff;
                width: 0;
                height: 0;
            }}
            QSpinBox::down-arrow {{
                image: none;
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-top: 5px solid #00f3ff;
                width: 0;
                height: 0;
            }}
            
            /* QComboBox Styling */
            QComboBox::drop-down {{
                subcontrol-origin: padding;
                subcontrol-position: top right;
                width: 26px;
                border-left: 1px solid #1a2a40;
                background: #0f1c35;
                border-top-right-radius: 5px;
                border-bottom-right-radius: 5px;
            }}
            QComboBox::down-arrow {{
                image: none;
                border-left: 4px solid transparent;
                border-right: 4px solid transparent;
                border-top: 5px solid #00f3ff;
                width: 0;
                height: 0;
            }}
            QComboBox QAbstractItemView {{
                border: 1px solid #00f3ff;
                background-color: #0c1527;
                color: #ffffff;
                selection-background-color: rgba(0, 243, 255, 0.15);
                selection-color: #00f3ff;
                outline: 0;
                padding: 6px;
                border-radius: 6px;
            }}
            
            /* QTabWidget Styling */
            QTabWidget::pane {{
                border: 1px solid #162447;
                border-top: none;
                background: #050811;
                border-radius: 0px 0px 8px 8px;
                padding: 14px;
            }}
            QTabBar::tab {{
                background: #090e1a;
                color: #4a6080;
                border: 1px solid #162447;
                border-bottom: 3px solid transparent;
                padding: 10px 24px;
                margin-right: 2px;
                font-weight: bold;
                font-size: 13px;
                letter-spacing: 0.5px;
                min-width: 140px;
            }}
            QTabBar::tab:selected {{
                background: #0b1122;
                color: #00f3ff;
                border: 1px solid #162447;
                border-bottom: 3px solid #00f3ff;
            }}
            QTabBar::tab:hover:!selected {{
                background: #0c1527;
                color: #7fd8e8;
                border-bottom: 3px solid #0066aa;
            }}
            
            /* QSlider Styling */
            QSlider::groove:horizontal {{
                height: 6px;
                background: #0f172a;
                border-radius: 3px;
            }}
            QSlider::handle:horizontal {{
                background: #ffffff;
                width: 14px;
                height: 14px;
                margin: -4px 0;
                border-radius: 7px;
                border: 2px solid #00f3ff;
            }}
            QSlider::handle:horizontal:hover {{
                background: #00f3ff;
                border: 2px solid #ffffff;
            }}
            QSlider::sub-page:horizontal {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0066ff, stop:1 #00f3ff);
                border-radius: 3px;
            }}
            
            /* QCheckBox Styling */
            QCheckBox {{
                spacing: 8px;
                color: #ffffff;
                font-size: 13px;
                font-weight: bold;
            }}
            QCheckBox::indicator {{
                width: 18px;
                height: 18px;
                border: 1px solid #1a2a40;
                border-radius: 4px;
                background: #0c1527;
            }}
            QCheckBox::indicator:hover {{
                border: 1px solid #00f3ff;
                background: rgba(0, 243, 255, 0.05);
            }}
            QCheckBox::indicator:checked {{
                border: 1px solid #00f3ff;
                background: #00f3ff;
                image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000000' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'><polyline points='20 6 9 17 4 12'></polyline></svg>");
            }}
        """)
        
        # Load existing settings if any
        if not hasattr(self.app, 'video_effects_config') or not isinstance(self.app.video_effects_config, dict):
            self.app.video_effects_config = {'watermark': None, 'blur': None, 'text': None}
            
        self.initial_config = copy.deepcopy(self.app.video_effects_config)
            
        self._is_loading = True
        self._cached_logo_path = None
        self._cached_logo_size = (100, 100)
        self.setup_ui()
        self._is_loading = False
        
    def _btn_style(self, color_obj):
        r, g, b = color_obj.red(), color_obj.green(), color_obj.blue()
        hex_color = color_obj.name()
        return f"""
            QPushButton {{
                background-color: rgba({r}, {g}, {b}, 0.08);
                color: {hex_color};
                border: 1px solid {hex_color};
                border-radius: 6px;
                padding: 10px 24px;
                font-weight: bold;
                font-size: 13px;
                font-family: 'Segoe UI', 'Hanuman', 'Battambang', sans-serif;
            }}
            QPushButton:hover {{
                background-color: rgba({r}, {g}, {b}, 0.22);
                color: #ffffff;
                border: 1px solid {hex_color};
            }}
            QPushButton:pressed {{
                background-color: rgba({r}, {g}, {b}, 0.4);
                color: #ffffff;
            }}
        """

    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(14)
        
        self.tabs = QTabWidget()
        self.tab_wm = QWidget()
        self.tab_blur = QWidget()
        self.tab_text = QWidget()
        self.tabs.addTab(self.tab_wm,   "🖼  ADD LOGO / WATERMARK")
        self.tabs.addTab(self.tab_blur, "💧 BLUR REGION")
        self.tabs.addTab(self.tab_text, "📝 ADD TEXT")
        layout.addWidget(self.tabs)
        
        self.setup_watermark_tab()
        self.setup_blur_tab()
        self.setup_text_tab()
        
        # Actions
        btn_layout = QHBoxLayout()
        self.btn_apply = QPushButton("✔️ Apply & Close")
        self.btn_remove = QPushButton("🗑️ Remove All")
        self.btn_close = QPushButton("✖ Cancel")
        
        self.btn_apply.setStyleSheet(self._btn_style(self.colors['success']))
        self.btn_remove.setStyleSheet(self._btn_style(self.colors['danger']))
        self.btn_close.setStyleSheet(self._btn_style(self.colors['gray']))
        
        self.btn_apply.clicked.connect(self.accept)
        self.btn_remove.clicked.connect(self.remove_settings)
        self.btn_close.clicked.connect(self.reject_changes)
        
        btn_layout.addWidget(self.btn_apply)
        btn_layout.addWidget(self.btn_remove)
        btn_layout.addWidget(self.btn_close)
        layout.addLayout(btn_layout)

    def setup_watermark_tab(self):
        layout = QVBoxLayout(self.tab_wm)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(12)

        # Header: Enable checkbox + description
        header_row = QHBoxLayout()
        self.enable_wm_cb = QCheckBox("Enable Logo / Watermark")
        self.enable_wm_cb.setStyleSheet(
            "QCheckBox { color:#00f3ff; font-weight:bold; font-size:13px; }")
        self.enable_wm_cb.stateChanged.connect(self.update_live_preview)
        header_row.addWidget(self.enable_wm_cb)
        header_row.addStretch()
        desc = QLabel("Add a logo or watermark image to the video.")
        desc.setObjectName("desc_label")
        header_row.addWidget(desc)
        layout.addLayout(header_row)

        # 1. Source & Keying Card
        card_src = QFrame()
        card_src.setProperty("class", "SettingsCard")
        card_src.setFrameShape(QFrame.StyledPanel)
        src_lay = QVBoxLayout(card_src)
        src_lay.setContentsMargins(14, 12, 14, 12)
        src_lay.setSpacing(10)
        
        src_title = QLabel("|  SOURCE & CHROMA KEY")
        src_title.setObjectName("section_hdr")
        src_lay.addWidget(src_title)
        
        logo_row = QHBoxLayout()
        logo_row.setSpacing(8)
        l_lbl = QLabel("🖼️ Logo File:")
        l_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold; min-width:80px;")
        l_lbl.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        logo_row.addWidget(l_lbl)
        
        self.logo_path = QLineEdit()
        self.logo_path.setPlaceholderText("Select transparent PNG, JPG, or video file...")
        self.logo_path.setFixedHeight(36)
        self.logo_path.setStyleSheet("""
            QLineEdit {
                background: #080e1a;
                border: 1px solid #1a2a40;
                border-radius: 6px;
                color: #ffffff;
                font-size: 13px;
                padding: 4px 10px;
            }
            QLineEdit:focus { border: 1px solid #00f3ff; background: #0c1527; }
        """)
        self.logo_path.textChanged.connect(self.update_live_preview)
        logo_row.addWidget(self.logo_path, 1)
        
        btn_browse = QPushButton("Browse")
        btn_browse.setFixedHeight(36)
        btn_browse.setStyleSheet(self._btn_style(self.colors['gray']))
        btn_browse.clicked.connect(self.pick_logo)
        logo_row.addWidget(btn_browse)
        src_lay.addLayout(logo_row)
        
        chroma_row = QHBoxLayout()
        chroma_row.setSpacing(8)
        
        self.cb_green_screen = QCheckBox("Active Chroma Key (Green Screen)")
        self.cb_green_screen.setStyleSheet("QCheckBox { color: #00ff66; font-weight: bold; font-size: 13px; }")
        self.cb_green_screen.stateChanged.connect(self.update_live_preview)
        chroma_row.addWidget(self.cb_green_screen)
        
        chroma_row.addSpacing(15)
        c_lbl = QLabel("Key Color:")
        c_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        chroma_row.addWidget(c_lbl)
        
        self.cb_green_screen_color = QComboBox()
        self.cb_green_screen_color.addItems(["Green", "Blue", "Black", "White"])
        self.cb_green_screen_color.setFixedWidth(100)
        self.cb_green_screen_color.currentIndexChanged.connect(self.update_live_preview)
        self.cb_green_screen.toggled.connect(self.cb_green_screen_color.setEnabled)
        chroma_row.addWidget(self.cb_green_screen_color)
        chroma_row.addStretch()
        
        src_lay.addLayout(chroma_row)
        layout.addWidget(card_src)
        
        # Sub-layout for columns
        cols_layout = QHBoxLayout()
        cols_layout.setSpacing(12)
        
        # 2. Transform Card (Left)
        card_trans = QFrame()
        card_trans.setProperty("class", "SettingsCard")
        card_trans.setFrameShape(QFrame.StyledPanel)
        trans_lay = QFormLayout(card_trans)
        trans_lay.setContentsMargins(14, 12, 14, 12)
        trans_lay.setSpacing(10)
        
        trans_title = QLabel("|  TRANSFORMATIONS")
        trans_title.setObjectName("section_hdr")
        trans_lay.addRow(trans_title)
        
        # Scale
        scale_layout = QHBoxLayout()
        self.scale_slider = QSlider(Qt.Horizontal)
        self.scale_slider.setRange(1, 500)
        self.scale_slider.setValue(100)
        self.scale_lbl = QLabel("100 %")
        self.scale_lbl.setFixedWidth(50)
        self.scale_lbl.setStyleSheet("color:#ffffff; font-size:13px;")
        self.scale_slider.valueChanged.connect(lambda v: self.scale_lbl.setText(f"{v} %"))
        self.scale_slider.valueChanged.connect(self.update_live_preview)
        scale_layout.addWidget(self.scale_slider)
        scale_layout.addWidget(self.scale_lbl)
        
        s_lbl = QLabel("🔍 Scale:")
        s_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        trans_lay.addRow(s_lbl, scale_layout)
        
        # Rotation
        rotation_layout = QHBoxLayout()
        self.rotation_slider = QSlider(Qt.Horizontal)
        self.rotation_slider.setRange(0, 360)
        self.rotation_slider.setValue(0)
        self.rotation_lbl = QLabel("0°")
        self.rotation_lbl.setFixedWidth(50)
        self.rotation_lbl.setStyleSheet("color:#ffffff; font-size:13px;")
        self.rotation_slider.valueChanged.connect(lambda v: self.rotation_lbl.setText(f"{v}°"))
        self.rotation_slider.valueChanged.connect(self.update_live_preview)
        rotation_layout.addWidget(self.rotation_slider)
        rotation_layout.addWidget(self.rotation_lbl)
        
        r_lbl = QLabel("🔄 Rotation:")
        r_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        trans_lay.addRow(r_lbl, rotation_layout)

        # Animation Dropdown
        self.wm_anim = QComboBox()
        self.wm_anim.addItems([
            "None", "Pulse", "Continuous Spin", "Bounce", "Fade In-Out",
            "Horizontal Slide In", "Vertical Drop", "Wiggle Shiver", "Circular Orbit", "Flicker Flash",
            "Heartbeat", "Zoom In-Out", "Glitch Jitter", "Wave Float", "Rotate Oscillate",
            "Slide & Fade", "Elastic Spring", "Vortex Spin", "Random Drift", "Cinema Cinematic Slide"
        ])
        self.wm_anim.currentIndexChanged.connect(self.update_live_preview)
        
        a_lbl = QLabel("🎬 Animation:")
        a_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        trans_lay.addRow(a_lbl, self.wm_anim)
        
        # Visual Style Filter Dropdown
        self.wm_filter = QComboBox()
        self.wm_filter.addItems([
            "None", "Vibrant", "Cyberpunk Cyan-Pink", "Neon Glow", "Retro VHS Scanline",
            "Monochrome (Black & White)", "Vintage Sepia", "Warm Cinematic", "Cool Ice",
            "Gold Foil Sheen", "Glitch Aberration", "Glassmorphism Blur", "Half Opacity Silhouette",
            "Electric Violet Highlight", "Fire Glow Outline", "Metallic Chrome", "Old Film Grain",
            "Ghost Glow", "Vaporwave Pastel", "High Contrast Accent"
        ])
        self.wm_filter.currentIndexChanged.connect(self.update_live_preview)
        
        f_lbl = QLabel("🎨 Visual Style:")
        f_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        trans_lay.addRow(f_lbl, self.wm_filter)
        
        cols_layout.addWidget(card_trans, 1)
        
        # 3. Position Card (Right)
        card_pos = QFrame()
        card_pos.setProperty("class", "SettingsCard")
        card_pos.setFrameShape(QFrame.StyledPanel)
        pos_lay = QFormLayout(card_pos)
        pos_lay.setContentsMargins(14, 12, 14, 12)
        pos_lay.setSpacing(10)
        
        pos_title = QLabel("|  PLACEMENT & VISIBILITY")
        pos_title.setObjectName("section_hdr")
        pos_lay.addRow(pos_title)
        
        # Position row: X and Y compact
        self.x_spin = QSpinBox(); self.x_spin.setRange(-4000, 4000)
        self.y_spin = QSpinBox(); self.y_spin.setRange(-4000, 4000)
        self.x_spin.setFixedHeight(30); self.y_spin.setFixedHeight(30)
        self.x_spin.valueChanged.connect(self.update_live_preview)
        self.y_spin.valueChanged.connect(self.update_live_preview)
        
        pos_w = QWidget(); pos_l = QHBoxLayout(pos_w)
        pos_l.setContentsMargins(0,0,0,0); pos_l.setSpacing(8)
        lx = QLabel("X:"); lx.setStyleSheet("color:#8ab4d4;font-size:13px;font-weight:bold;")
        ly = QLabel("Y:"); ly.setStyleSheet("color:#8ab4d4;font-size:13px;font-weight:bold;")
        pos_l.addWidget(lx); pos_l.addWidget(self.x_spin)
        pos_l.addWidget(ly); pos_l.addWidget(self.y_spin)
        
        p_lbl = QLabel("📍 Position:")
        p_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        pos_lay.addRow(p_lbl, pos_w)
        
        # Opacity slider
        opacity_layout = QHBoxLayout()
        self.opacity_slider = QSlider(Qt.Horizontal)
        self.opacity_slider.setRange(0, 100)
        self.opacity_slider.setValue(100)
        self.opacity_lbl = QLabel("100 %")
        self.opacity_lbl.setFixedWidth(50)
        self.opacity_lbl.setStyleSheet("color:#ffffff; font-size:13px;")
        self.opacity_slider.valueChanged.connect(lambda v: self.opacity_lbl.setText(f"{v} %"))
        self.opacity_slider.valueChanged.connect(self.update_live_preview)
        opacity_layout.addWidget(self.opacity_slider)
        opacity_layout.addWidget(self.opacity_lbl)
        
        o_lbl = QLabel("👻 Opacity:")
        o_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        pos_lay.addRow(o_lbl, opacity_layout)
        
        cols_layout.addWidget(card_pos, 1)
        layout.addLayout(cols_layout)

        # Load existing config
        conf = self.app.video_effects_config.get('watermark')
        if conf:
            self.enable_wm_cb.setChecked(conf.get('enabled', False))
            self.logo_path.setText(conf.get('path', ''))
            self.x_spin.setValue(conf.get('x', 0))
            self.y_spin.setValue(conf.get('y', 0))
            self.scale_slider.setValue(conf.get('scale', 100))
            self.opacity_slider.setValue(conf.get('opacity', 100))
            self.rotation_slider.setValue(conf.get('rotation', 0))
            self.wm_anim.setCurrentText(conf.get('animation', 'None'))
            if hasattr(self, 'wm_filter'):
                self.wm_filter.setCurrentText(conf.get('filter', 'None'))
            self.cb_green_screen.setChecked(conf.get('green_screen', False))
            key_color = conf.get('key_color', 'Green')
            idx = self.cb_green_screen_color.findText(key_color)
            if idx >= 0:
                self.cb_green_screen_color.setCurrentIndex(idx)
            self.cb_green_screen_color.setEnabled(self.cb_green_screen.isChecked())
        else:
            self.scale_slider.setValue(25) # Default to a smaller, reasonable scale
            self.opacity_slider.setValue(100)
            self.rotation_slider.setValue(0)
            self.wm_anim.setCurrentText('None')
            if hasattr(self, 'wm_filter'):
                self.wm_filter.setCurrentText('None')
            self.cb_green_screen_color.setEnabled(False)

        layout.addStretch()

    def setup_blur_tab(self):
        layout = QVBoxLayout(self.tab_blur)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(12)

        # Header: Enable checkbox + description
        header_row = QHBoxLayout()
        self.enable_blur_cb = QCheckBox("Enable Blur Effect")
        self.enable_blur_cb.setStyleSheet(
            "QCheckBox { color:#00f3ff; font-weight:bold; font-size:13px; }")
        self.enable_blur_cb.stateChanged.connect(self.update_live_preview)
        header_row.addWidget(self.enable_blur_cb)
        header_row.addStretch()
        desc = QLabel("Blur a specific region in the video.")
        desc.setObjectName("desc_label")
        header_row.addWidget(desc)
        layout.addLayout(header_row)

        # Columns layout
        cols_layout = QHBoxLayout()
        cols_layout.setSpacing(12)

        # 1. Blur settings card (Left)
        card_settings = QFrame()
        card_settings.setProperty("class", "SettingsCard")
        card_settings.setFrameShape(QFrame.StyledPanel)
        set_lay = QFormLayout(card_settings)
        set_lay.setContentsMargins(14, 12, 14, 12)
        set_lay.setSpacing(10)

        set_title = QLabel("|  BLUR PROPERTIES")
        set_title.setObjectName("section_hdr")
        set_lay.addRow(set_title)

        # Shape selection
        self.blur_shape = QComboBox()
        self.blur_shape.addItems(["Rectangle", "Circle / Ellipse"])
        self.blur_shape.currentIndexChanged.connect(self.update_live_preview)
        
        sh_lbl = QLabel("🔮 Shape:")
        sh_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        set_lay.addRow(sh_lbl, self.blur_shape)

        # Blur Style selection
        self.blur_style = QComboBox()
        self.blur_style.addItems([
            "Standard Gaussian", "Pixelated Mosaic", "Radial Zoom Blur", "Motion Blur Horizontal",
            "Motion Blur Vertical", "Cyberpunk Glitch Blur", "Frosted Slate Glass", "Color Tinted Red Blur",
            "Color Tinted Blue Blur", "Color Tinted Green Blur", "Neon Glow Border Blur", "Thermal Heatmap Blur",
            "Old Film Grain Blur", "Vignette Dark Blur", "High Contrast Halftone", "Rainbow Spectral Blur",
            "Monochrome Grayscale Blur", "Inverted Color Blur", "Double Exposure Blur", "Soft Dreamy Glow"
        ])
        self.blur_style.currentIndexChanged.connect(self.update_live_preview)
        
        sty_lbl = QLabel("🎨 Blur Style:")
        sty_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        set_lay.addRow(sty_lbl, self.blur_style)

        # Blur strength slider
        strength_layout = QHBoxLayout()
        self.blur_slider = QSlider(Qt.Horizontal)
        self.blur_slider.setRange(1, 50)
        self.blur_slider.setValue(15)
        self.blur_lbl = QLabel("15")
        self.blur_lbl.setFixedWidth(30)
        self.blur_lbl.setStyleSheet("color:#ffffff; font-size:13px;")
        self.blur_slider.valueChanged.connect(lambda v: self.blur_lbl.setText(str(v)))
        self.blur_slider.valueChanged.connect(self.update_live_preview)
        strength_layout.addWidget(self.blur_slider)
        strength_layout.addWidget(self.blur_lbl)
        
        st_lbl = QLabel("🎚️ Strength:")
        st_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        set_lay.addRow(st_lbl, strength_layout)

        # Blur feather slider
        feather_layout = QHBoxLayout()
        self.blur_feather = QSlider(Qt.Horizontal)
        self.blur_feather.setRange(0, 100)
        self.blur_feather.setValue(50)
        self.blur_feather_lbl = QLabel("50 %")
        self.blur_feather_lbl.setFixedWidth(55)
        self.blur_feather_lbl.setStyleSheet("color:#ffffff; font-size:13px;")
        self.blur_feather.valueChanged.connect(lambda v: self.blur_feather_lbl.setText(f"{v} %"))
        self.blur_feather.valueChanged.connect(self.update_live_preview)
        feather_layout.addWidget(self.blur_feather)
        feather_layout.addWidget(self.blur_feather_lbl)
        
        fe_lbl = QLabel("🪶 Feather:")
        fe_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        set_lay.addRow(fe_lbl, feather_layout)

        cols_layout.addWidget(card_settings, 1)

        # 2. Geometry Card (Right)
        card_region = QFrame()
        card_region.setProperty("class", "SettingsCard")
        card_region.setFrameShape(QFrame.StyledPanel)
        reg_lay = QFormLayout(card_region)
        reg_lay.setContentsMargins(14, 12, 14, 12)
        reg_lay.setSpacing(10)

        reg_title = QLabel("|  AREA GEOMETRY")
        reg_title.setObjectName("section_hdr")
        reg_lay.addRow(reg_title)

        # Coordinates & Size
        self.blur_x = QSpinBox(); self.blur_x.setRange(-4000, 4000)
        self.blur_y = QSpinBox(); self.blur_y.setRange(-4000, 4000)
        self.blur_w = QSpinBox(); self.blur_w.setRange(10, 4000); self.blur_w.setValue(200)
        self.blur_h = QSpinBox(); self.blur_h.setRange(10, 4000); self.blur_h.setValue(100)
        
        self.blur_x.setFixedHeight(30); self.blur_y.setFixedHeight(30)
        self.blur_w.setFixedHeight(30); self.blur_h.setFixedHeight(30)

        self.blur_x.valueChanged.connect(self.update_live_preview)
        self.blur_y.valueChanged.connect(self.update_live_preview)
        self.blur_w.valueChanged.connect(self.update_live_preview)
        self.blur_h.valueChanged.connect(self.update_live_preview)

        # Position row: X and Y compact
        pos_w = QWidget(); pos_l = QHBoxLayout(pos_w)
        pos_l.setContentsMargins(0,0,0,0); pos_l.setSpacing(8)
        lx = QLabel("X:"); lx.setStyleSheet("color:#8ab4d4;font-size:13px;font-weight:bold;")
        ly = QLabel("Y:"); ly.setStyleSheet("color:#8ab4d4;font-size:13px;font-weight:bold;")
        pos_l.addWidget(lx); pos_l.addWidget(self.blur_x)
        pos_l.addWidget(ly); pos_l.addWidget(self.blur_y)
        
        p_lbl = QLabel("📍 Position:")
        p_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        reg_lay.addRow(p_lbl, pos_w)

        # Dimension row: Width and Height compact
        dim_w = QWidget(); dim_l = QHBoxLayout(dim_w)
        dim_l.setContentsMargins(0,0,0,0); dim_l.setSpacing(8)
        lw = QLabel("W:"); lw.setStyleSheet("color:#8ab4d4;font-size:13px;font-weight:bold;")
        lh = QLabel("H:"); lh.setStyleSheet("color:#8ab4d4;font-size:13px;font-weight:bold;")
        dim_l.addWidget(lw); dim_l.addWidget(self.blur_w)
        dim_l.addWidget(lh); dim_l.addWidget(self.blur_h)
        
        d_lbl = QLabel("📐 Dimensions:")
        d_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        reg_lay.addRow(d_lbl, dim_w)

        cols_layout.addWidget(card_region, 1)
        layout.addLayout(cols_layout)

        conf = self.app.video_effects_config.get('blur')
        if conf:
            self.enable_blur_cb.setChecked(True)
            self.blur_x.setValue(conf.get('x', 0))
            self.blur_y.setValue(conf.get('y', 0))
            self.blur_w.setValue(conf.get('w', 200))
            self.blur_h.setValue(conf.get('h', 100))
            self.blur_slider.setValue(conf.get('strength', 15))
            self.blur_feather.setValue(conf.get('feather', 50))
            shape = conf.get('shape', 'Rectangle')
            idx = self.blur_shape.findText(shape)
            if idx >= 0:
                self.blur_shape.setCurrentIndex(idx)
                
            if hasattr(self, 'blur_style'):
                bstyle = conf.get('style', 'Standard Gaussian')
                idx_st = self.blur_style.findText(bstyle)
                if idx_st >= 0:
                    self.blur_style.setCurrentIndex(idx_st)

        layout.addStretch()

    def setup_text_tab(self):
        from PyQt5.QtWidgets import (QComboBox, QCompleter, QFrame, QGridLayout)
        layout = QVBoxLayout(self.tab_text)
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(12)

        # Header: Enable checkbox + description
        header_row = QHBoxLayout()
        self.enable_text_cb = QCheckBox("Enable Text Effect")
        self.enable_text_cb.setStyleSheet(
            "QCheckBox { color:#00f3ff; font-weight:bold; font-size:13px; }")
        self.enable_text_cb.stateChanged.connect(self.update_live_preview)
        header_row.addWidget(self.enable_text_cb)
        header_row.addStretch()
        desc = QLabel("Add custom text overlay to the video.")
        desc.setObjectName("desc_label")
        header_row.addWidget(desc)
        layout.addLayout(header_row)

        # Text input row
        text_row = QHBoxLayout()
        text_row.setSpacing(8)
        t_lbl = QLabel("✏️ Text:")
        t_lbl.setStyleSheet(
            "color:#8ab4d4; font-size:13px; font-weight:bold; min-width:50px;")
        t_lbl.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        text_row.addWidget(t_lbl)
        
        self.text_input = QLineEdit()
        self.text_input.setPlaceholderText("Enter your overlay text here...")
        self.text_input.setFixedHeight(36)
        self.text_input.textChanged.connect(self.update_live_preview)
        text_row.addWidget(self.text_input, 1)
        layout.addLayout(text_row)

        # Multi-column settings cards
        cols_layout = QHBoxLayout()
        cols_layout.setSpacing(12)

        # Left Column Layout (Typography & Placement Cards)
        left_col = QVBoxLayout()
        left_col.setSpacing(12)

        # Card 1: Typography
        card_typo = QFrame()
        card_typo.setProperty("class", "SettingsCard")
        card_typo.setFrameShape(QFrame.StyledPanel)
        typo_lay = QFormLayout(card_typo)
        typo_lay.setContentsMargins(14, 12, 14, 12)
        typo_lay.setSpacing(10)

        typo_title = QLabel("|  TYPOGRAPHY & STYLING")
        typo_title.setObjectName("section_hdr")
        typo_lay.addRow(typo_title)

        # Font Combo
        self.font_combo = QComboBox()
        self.font_combo.addItem("Default (DaunPenh / Arial)", "")
        import os, winreg
        fonts_dict = {}
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                    r'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts') as k:
                for i in range(10000):
                     try:
                         name, val, _ = winreg.EnumValue(k, i)
                         if not os.path.isabs(val):
                             val = os.path.join(
                                 os.environ.get("WINDIR","C:\\Windows"),"Fonts",val)
                         fonts_dict[name.replace(" (TrueType)","")
                                       .replace(" (OpenType)","")] = val
                     except OSError: break
        except Exception: pass
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                    r'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts') as k:
                for i in range(10000):
                     try:
                         name, val, _ = winreg.EnumValue(k, i)
                         if not os.path.isabs(val):
                             val = os.path.join(
                                 os.environ.get("LOCALAPPDATA","C:\\"),
                                 "Microsoft","Windows","Fonts",val)
                         fonts_dict[name.replace(" (TrueType)","")
                                       .replace(" (OpenType)","")] = val
                     except OSError: break
        except Exception: pass
        for name in sorted(fonts_dict.keys()):
            self.font_combo.addItem(name, fonts_dict[name])
        self.font_combo.setEditable(True)
        self.font_combo.completer().setCompletionMode(QCompleter.PopupCompletion)
        self.font_combo.completer().setFilterMode(Qt.MatchContains)
        self.font_combo.setInsertPolicy(QComboBox.NoInsert)
        self.font_combo.currentIndexChanged.connect(self.update_live_preview)
        self.font_combo.editTextChanged.connect(self.update_live_preview)

        f_lbl = QLabel("🔤 Font:")
        f_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        typo_lay.addRow(f_lbl, self.font_combo)

        # Color Style
        self.text_color = QComboBox()
        self.text_color.addItems([
            "White","Black","Red","Yellow","Green","Blue",
            "TikTok Glitch Style", "Neon Mint-Green", "Electric Violet",
            "Retro Vaporwave", "Silver Metallic", "Fire Flame", "Ice & Snow",
            "Rainbow Gradient","Rainbow Cycle","Neon Sunset",
            "Cyberpunk Pink-Cyan","Golden Luxury", "Rose Gold Gradient", "Emerald Forest"])
        self.text_color.currentTextChanged.connect(self.update_live_preview)

        c_lbl = QLabel("🎨 Color Style:")
        c_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        typo_lay.addRow(c_lbl, self.text_color)

        # Font Size
        self.text_size = QSpinBox()
        self.text_size.setRange(10, 500); self.text_size.setValue(50)
        self.text_size.setFixedHeight(30)
        self.text_size.setFixedWidth(100)
        self.text_size.valueChanged.connect(self.update_live_preview)

        s_lbl = QLabel("📏 Font Size:")
        s_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        typo_lay.addRow(s_lbl, self.text_size)

        left_col.addWidget(card_typo)

        # Card 3: Placement & Motion (inside Left Column)
        card_place = QFrame()
        card_place.setProperty("class", "SettingsCard")
        card_place.setFrameShape(QFrame.StyledPanel)
        place_lay = QFormLayout(card_place)
        place_lay.setContentsMargins(14, 12, 14, 12)
        place_lay.setSpacing(8)

        place_title = QLabel("|  PLACEMENT & MOTION")
        place_title.setObjectName("section_hdr")
        place_lay.addRow(place_title)

        # Position X and Y
        self.text_x = QSpinBox(); self.text_x.setRange(-4000, 4000)
        self.text_y = QSpinBox(); self.text_y.setRange(-4000, 4000)
        self.text_x.setFixedHeight(30); self.text_y.setFixedHeight(30)
        self.text_x.valueChanged.connect(self.update_live_preview)
        self.text_y.valueChanged.connect(self.update_live_preview)

        pos_w = QWidget(); pos_l = QHBoxLayout(pos_w)
        pos_l.setContentsMargins(0,0,0,0); pos_l.setSpacing(8)
        lx = QLabel("X:"); lx.setStyleSheet("color:#8ab4d4;font-size:13px;font-weight:bold;")
        ly = QLabel("Y:"); ly.setStyleSheet("color:#8ab4d4;font-size:13px;font-weight:bold;")
        pos_l.addWidget(lx); pos_l.addWidget(self.text_x)
        pos_l.addWidget(ly); pos_l.addWidget(self.text_y)

        p_lbl = QLabel("📍 Position:")
        p_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        place_lay.addRow(p_lbl, pos_w)

        # Rotation
        text_rot_layout = QHBoxLayout()
        self.text_rotation_slider = QSlider(Qt.Horizontal)
        self.text_rotation_slider.setRange(0, 360)
        self.text_rotation_slider.setValue(0)
        self.text_rotation_lbl = QLabel("0°")
        self.text_rotation_lbl.setFixedWidth(40)
        self.text_rotation_lbl.setStyleSheet("color:#ffffff; font-size:13px;")
        self.text_rotation_slider.valueChanged.connect(lambda v: self.text_rotation_lbl.setText(f"{v}°"))
        self.text_rotation_slider.valueChanged.connect(self.update_live_preview)
        text_rot_layout.addWidget(self.text_rotation_slider)
        text_rot_layout.addWidget(self.text_rotation_lbl)

        r_lbl = QLabel("🔄 Rotation:")
        r_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        place_lay.addRow(r_lbl, text_rot_layout)

        # Animation
        self.text_anim = QComboBox()
        self.text_anim.addItems([
            "None", "Scroll L-to-R", "Scroll R-to-L", "Bounce", "Wiggle", "Pulse",
            "Heartbeat Jump", "Flicker Reveal", "Typewriter Effect", "Zoom In Pop", "Wave Dance",
            "Slide Up Fade", "Slide Down Fade", "Continuous Spin", "Jitter Glitch", "Elastic Stretch",
            "Circular Drift", "Fading Teleport", "Swing Pendulum", "Rainbow Cycle Anim"
        ])
        self.text_anim.currentTextChanged.connect(self.update_live_preview)

        a_lbl = QLabel("🎬 Animation:")
        a_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        place_lay.addRow(a_lbl, self.text_anim)

        left_col.addWidget(card_place)
        cols_layout.addLayout(left_col, 1)

        # Card 2: FX & Outlines (Right Column)
        card_fx = QFrame()
        card_fx.setProperty("class", "SettingsCard")
        card_fx.setFrameShape(QFrame.StyledPanel)
        fx_lay = QFormLayout(card_fx)
        fx_lay.setContentsMargins(14, 12, 14, 12)
        fx_lay.setSpacing(10)

        fx_title = QLabel("|  APPEARANCE & VISUAL FX")
        fx_title.setObjectName("section_hdr")
        fx_lay.addRow(fx_title)

        # Background Box Style
        self.text_bg_style = QComboBox()
        self.text_bg_style.addItems([
            "None", "Semi-Transparent Black", "Dark Glassmorphism", "Neon Border Box",
            "Gradient Slide Box", "Retro VHS Rounded Box", "Frosted Cyberpunk Box", "Cyber Neon Pink Box",
            "Retro Yellow Subtitle Box", "Transparent White Glass", "Vaporwave Grid Box", "Classic Cinema Black Bar",
            "Electric Blue Border Box", "Soft Shadow Plate", "Burning Fire Box", "Ice Castle Box",
            "Golden Border Ribbon", "Comic Book Speech Plate", "Carbon Fiber Tech Plate", "Sunset Gradient Frame"
        ])
        self.text_bg_style.currentTextChanged.connect(self.update_live_preview)

        bg_lbl = QLabel("🔲 Background:")
        bg_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        fx_lay.addRow(bg_lbl, self.text_bg_style)

        # Shadow/Glow
        self.text_shadow_glow = QComboBox()
        self.text_shadow_glow.addItems([
            "None", "Soft Shadow", "Hard Shadow", "TikTok Offset Glow",
            "Vaporwave Magenta Glow", "Cinema Ambient Glow", "Neon Glow Cyan",
            "Neon Glow Pink", "Neon Glow Yellow", "Deep 3D Shadow",
            "Double Glitch Glow", "Red Laser Glow", "Green Matrix Glow", "Electric Violet Halo",
            "Sunset Orange Aura", "Golden Crown Outline", "Ghostly Ice Glow", "Vaporwave Grid Shadow",
            "Comic Outline Thick", "Subtle Warm Under-Glow"
        ])
        self.text_shadow_glow.currentTextChanged.connect(self.update_live_preview)

        sg_lbl = QLabel("🔮 Shadow/Glow:")
        sg_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        fx_lay.addRow(sg_lbl, self.text_shadow_glow)

        # Outline Width and Color row
        self.text_outline_width = QSpinBox()
        self.text_outline_width.setRange(0, 30); self.text_outline_width.setValue(0)
        self.text_outline_width.setFixedHeight(30)
        self.text_outline_width.setFixedWidth(60)
        self.text_outline_width.valueChanged.connect(self.update_live_preview)

        self.text_outline_color = QComboBox()
        self.text_outline_color.addItems(["Black","White","Red","Blue","Green","Yellow","Gray"])
        self.text_outline_color.currentTextChanged.connect(self.update_live_preview)

        out_w = QWidget(); out_l = QHBoxLayout(out_w)
        out_l.setContentsMargins(0,0,0,0); out_l.setSpacing(6)
        out_l.addWidget(self.text_outline_width)
        lbl_oc = QLabel("Color:")
        lbl_oc.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        out_l.addWidget(lbl_oc)
        out_l.addWidget(self.text_outline_color, 1)

        o_lbl = QLabel("🖋️ Outline:")
        o_lbl.setStyleSheet("color:#8ab4d4; font-size:13px; font-weight:bold;")
        fx_lay.addRow(o_lbl, out_w)

        cols_layout.addWidget(card_fx, 1)
        layout.addLayout(cols_layout)

        # Restore saved config
        conf = self.app.video_effects_config.get("text")
        if conf:
            self.enable_text_cb.setChecked(True)
            self.text_input.setText(conf.get("text", ""))
            font_path = conf.get("font", "")
            if font_path:
                idx = self.font_combo.findData(font_path)
                if idx >= 0:
                    self.font_combo.setCurrentIndex(idx)
            self.text_color.setCurrentText(conf.get("color", "White"))
            self.text_size.setValue(conf.get("size", 50))
            self.text_x.setValue(conf.get("x", 0))
            self.text_y.setValue(conf.get("y", 0))
            self.text_anim.setCurrentText(conf.get("animation", "None"))
            self.text_outline_width.setValue(conf.get("outline_width", 0))
            self.text_outline_color.setCurrentText(conf.get("outline_color", "Black"))
            self.text_bg_style.setCurrentText(conf.get("bg_style", "None"))
            self.text_rotation_slider.setValue(conf.get("rotation", 0))
            self.text_shadow_glow.setCurrentText(conf.get("shadow_glow", "None"))

    def pick_logo(self):
        file, _ = QFileDialog.getOpenFileName(self, "Select Logo Media", "", "Images & Videos (*.png *.jpg *.jpeg *.mp4 *.avi *.mov *.webm)")
        if file:
            self.logo_path.setText(file)
            self.update_live_preview()

    def update_live_preview(self):
        if getattr(self, '_is_loading', False): return
        import os
        if not hasattr(self, 'logo_path'): return
        
        # Update config directly so video preview catches it
        wm_enabled = self.enable_wm_cb.isChecked() if hasattr(self, 'enable_wm_cb') else False
        wm_path = self.logo_path.text().strip()
        
        if wm_enabled and wm_path and os.path.exists(wm_path):
            if wm_path != self._cached_logo_path:
                import cv2
                img = cv2.imread(wm_path, cv2.IMREAD_UNCHANGED)
                if img is not None:
                    self._cached_logo_size = (img.shape[1], img.shape[0])
                else:
                    # Try video capture for metadata
                    cap = cv2.VideoCapture(wm_path)
                    ret, img = cap.read()
                    if ret:
                        self._cached_logo_size = (img.shape[1], img.shape[0])
                    cap.release()
                self._cached_logo_path = wm_path
                
            orig_w, orig_h = self._cached_logo_size
                
            self.app.video_effects_config['watermark'] = {
                'enabled': True,
                'path': wm_path,
                'x': self.x_spin.value() if hasattr(self, 'x_spin') else 0,
                'y': self.y_spin.value() if hasattr(self, 'y_spin') else 0,
                'scale': self.scale_slider.value() if hasattr(self, 'scale_slider') else 100,
                'opacity': self.opacity_slider.value() if hasattr(self, 'opacity_slider') else 100,
                'rotation': self.rotation_slider.value() if hasattr(self, 'rotation_slider') else 0,
                'animation': self.wm_anim.currentText() if hasattr(self, 'wm_anim') else 'None',
                'filter': self.wm_filter.currentText() if hasattr(self, 'wm_filter') else 'None',
                'orig_w': orig_w,
                'orig_h': orig_h,
                'green_screen': self.cb_green_screen.isChecked() if hasattr(self, 'cb_green_screen') else False,
                'key_color': self.cb_green_screen_color.currentText() if hasattr(self, 'cb_green_screen_color') else 'Green'
            }
        else:
            self.app.video_effects_config['watermark'] = None
            
        if hasattr(self, 'enable_blur_cb') and self.enable_blur_cb.isChecked():
            self.app.video_effects_config['blur'] = {
                'x': getattr(self, 'blur_x').value() if hasattr(self, 'blur_x') else 0,
                'y': getattr(self, 'blur_y').value() if hasattr(self, 'blur_y') else 0,
                'w': getattr(self, 'blur_w').value() if hasattr(self, 'blur_w') else 200,
                'h': getattr(self, 'blur_h').value() if hasattr(self, 'blur_h') else 100,
                'strength': getattr(self, 'blur_slider').value() if hasattr(self, 'blur_slider') else 15,
                'feather': getattr(self, 'blur_feather').value() if hasattr(self, 'blur_feather') else 50,
                'shape': getattr(self, 'blur_shape').currentText() if hasattr(self, 'blur_shape') else 'Rectangle',
                'style': getattr(self, 'blur_style').currentText() if hasattr(self, 'blur_style') else 'Standard Gaussian'
            }
        else:
            self.app.video_effects_config['blur'] = None
            
        if hasattr(self, 'enable_text_cb') and self.enable_text_cb.isChecked() and hasattr(self, 'text_input'):
            text_str = self.text_input.text()
            font_path = ""
            if hasattr(self, 'font_combo'):
                idx = self.font_combo.currentIndex()
                if idx < 0:
                    idx = self.font_combo.findText(self.font_combo.currentText())
                if idx >= 0:
                    font_path = self.font_combo.itemData(idx)
                    
            if not font_path: font_path = ""
            size = getattr(self, 'text_size').value() if hasattr(self, 'text_size') else 50
            
            try:
                from PyQt5.QtGui import QFont, QFontMetrics, QFontDatabase
                import os
                font = QFont()
                if font_path and os.path.exists(font_path):
                    if font_path not in _LOADED_FONTS:
                        font_id = QFontDatabase.addApplicationFont(font_path)
                        if font_id != -1:
                            family = QFontDatabase.applicationFontFamilies(font_id)[0]
                            _LOADED_FONTS[font_path] = family
                        else:
                            _LOADED_FONTS[font_path] = None
                    family = _LOADED_FONTS[font_path]
                    if family:
                        font = QFont(family, size)
                    else:
                        font = QFont("DaunPenh", size)
                else:
                    font = QFont("DaunPenh", size)
                    
                fm = QFontMetrics(font)
                rect = fm.boundingRect(QRect(0, 0, 4000, 4000), Qt.AlignLeft | Qt.AlignTop, text_str if text_str else " ")
                w = rect.width() + 40
                h = rect.height() + 36
                left_offset, top_offset = 0, 0
            except Exception:
                w, h = 100, 50
                left_offset, top_offset = 0, 0
            
            self.app.video_effects_config['text'] = {
                'text': text_str,
                'font': font_path,
                'color': getattr(self, 'text_color').currentText() if hasattr(self, 'text_color') else 'White',
                'size': size,
                'x': getattr(self, 'text_x').value() if hasattr(self, 'text_x') else 0,
                'y': getattr(self, 'text_y').value() if hasattr(self, 'text_y') else 0,
                'w': w,
                'h': h,
                'left': left_offset,
                'top': top_offset,
                'animation': getattr(self, 'text_anim').currentText() if hasattr(self, 'text_anim') else 'None',
                'outline_width': getattr(self, 'text_outline_width').value() if hasattr(self, 'text_outline_width') else 0,
                'outline_color': getattr(self, 'text_outline_color').currentText() if hasattr(self, 'text_outline_color') else 'Black',
                'bg_style': getattr(self, 'text_bg_style').currentText() if hasattr(self, 'text_bg_style') else 'None',
                'rotation': getattr(self, 'text_rotation_slider').value() if hasattr(self, 'text_rotation_slider') else 0,
                'shadow_glow': getattr(self, 'text_shadow_glow').currentText() if hasattr(self, 'text_shadow_glow') else 'None'
            }
        else:
            self.app.video_effects_config['text'] = None
            
        if getattr(self.app, 'current_frame', None) is not None:
            self.app._display_frame(self.app.current_frame)

    def reject_changes(self):
        self.app.video_effects_config = copy.deepcopy(self.initial_config)
        if getattr(self.app, 'current_frame', None) is not None:
            self.app._display_frame(self.app.current_frame)
        self.reject()

    def remove_settings(self):
        self.app.video_effects_config['watermark'] = None
        self.app.video_effects_config['blur'] = None
        self.app.video_effects_config['text'] = None
        self.logo_path.clear()
        if hasattr(self, 'enable_wm_cb'): self.enable_wm_cb.setChecked(False)
        if hasattr(self, 'enable_blur_cb'): self.enable_blur_cb.setChecked(False)
        if hasattr(self, 'enable_text_cb'): self.enable_text_cb.setChecked(False)
        self.update_live_preview()
        self.accept()

    def accept(self):
        if hasattr(self.app, '_save_settings'):
            self.app._save_settings()
        super().accept()


def apply_effects_to_frame(frame, config):
    """Utility function to draw watermark, blur, and text on cv2 frame for preview"""
    import os
    import numpy as np
    
    if not config:
        return frame
        
    # Apply Blur First
    blur_conf = config.get('blur')
    if blur_conf:
        bx, by = blur_conf.get('x', 0), blur_conf.get('y', 0)
        bw, bh = blur_conf.get('w', 200), blur_conf.get('h', 100)
        strength = blur_conf.get('strength', 15)
        shape_type = blur_conf.get('shape', 'Rectangle')
        
        fh, fw = frame.shape[:2]
        if bx < fw and by < fh and bw > 0 and bh > 0:
            x1, y1 = max(0, bx), max(0, by)
            x2, y2 = min(fw, bx + bw), min(fh, by + bh)
            if x2 > x1 and y2 > y1:
                roi = frame[y1:y2, x1:x2]
                ksize = strength * 2 + 1
                
                # Compute blurred_roi based on the selected style
                style_name = blur_conf.get('style', 'Standard Gaussian')
                
                # Standard Gaussian blur as fallback / base
                blurred_roi = cv2.GaussianBlur(roi, (ksize, ksize), 0)
                
                if style_name == 'Pixelated Mosaic':
                    div = max(4, strength // 2)
                    sh_w, sh_h = max(1, (x2 - x1) // div), max(1, (y2 - y1) // div)
                    small = cv2.resize(roi, (sh_w, sh_h), interpolation=cv2.INTER_LINEAR)
                    blurred_roi = cv2.resize(small, (x2 - x1, y2 - y1), interpolation=cv2.INTER_NEAREST)
                elif style_name == 'Radial Zoom Blur':
                    h_roi, w_roi = roi.shape[:2]
                    cx, cy = w_roi // 2, h_roi // 2
                    accum = np.zeros_like(roi, dtype=np.float32)
                    steps = 8
                    for step in range(steps):
                        scale = 1.0 + (step / float(steps)) * (strength / 100.0)
                        M = cv2.getRotationMatrix2D((cx, cy), 0, scale)
                        warped = cv2.warpAffine(roi, M, (w_roi, h_roi), borderMode=cv2.BORDER_REPLICATE)
                        accum += warped.astype(np.float32)
                    blurred_roi = (accum / steps).astype(np.uint8)
                elif style_name == 'Motion Blur Horizontal':
                    kernel = np.zeros((ksize, ksize))
                    kernel[int((ksize-1)/2), :] = np.ones(ksize)
                    kernel = kernel / ksize
                    blurred_roi = cv2.filter2D(roi, -1, kernel)
                elif style_name == 'Motion Blur Vertical':
                    kernel = np.zeros((ksize, ksize))
                    kernel[:, int((ksize-1)/2)] = np.ones(ksize)
                    kernel = kernel / ksize
                    blurred_roi = cv2.filter2D(roi, -1, kernel)
                elif style_name == 'Cyberpunk Glitch Blur':
                    glitch = blurred_roi.copy()
                    shift = max(1, strength // 3)
                    r_ch = glitch[:, :, 2]
                    b_ch = glitch[:, :, 0]
                    glitch[:, :, 2] = np.roll(r_ch, shift, axis=1)
                    glitch[:, :, 0] = np.roll(b_ch, -shift, axis=1)
                    blurred_roi = glitch
                elif style_name == 'Frosted Slate Glass':
                    glass = cv2.addWeighted(blurred_roi, 0.85, np.full_like(blurred_roi, (240, 200, 160), dtype=np.uint8), 0.15, 0)
                    blurred_roi = cv2.convertScaleAbs(glass, alpha=1.1, beta=10)
                elif style_name == 'Color Tinted Red Blur':
                    tint = np.full_like(blurred_roi, (0, 0, 220), dtype=np.uint8)
                    blurred_roi = cv2.addWeighted(blurred_roi, 0.7, tint, 0.3, 0)
                elif style_name == 'Color Tinted Blue Blur':
                    tint = np.full_like(blurred_roi, (220, 0, 0), dtype=np.uint8)
                    blurred_roi = cv2.addWeighted(blurred_roi, 0.7, tint, 0.3, 0)
                elif style_name == 'Color Tinted Green Blur':
                    tint = np.full_like(blurred_roi, (0, 220, 0), dtype=np.uint8)
                    blurred_roi = cv2.addWeighted(blurred_roi, 0.7, tint, 0.3, 0)
                elif style_name == 'Thermal Heatmap Blur':
                    gray = cv2.cvtColor(blurred_roi, cv2.COLOR_BGR2GRAY)
                    thermal = cv2.applyColorMap(gray, cv2.COLORMAP_JET)
                    blurred_roi = cv2.addWeighted(blurred_roi, 0.3, thermal, 0.7, 0)
                elif style_name == 'Old Film Grain Blur':
                    noise = np.random.normal(0, strength * 0.8, blurred_roi.shape).astype(np.int16)
                    blurred_roi = np.clip(blurred_roi.astype(np.int16) + noise, 0, 255).astype(np.uint8)
                elif style_name == 'Vignette Dark Blur':
                    h_roi, w_roi = roi.shape[:2]
                    a_kernel = cv2.getGaussianKernel(w_roi, w_roi/2)
                    b_kernel = cv2.getGaussianKernel(h_roi, h_roi/2)
                    c_kernel = b_kernel * a_kernel.T
                    d_kernel = c_kernel / c_kernel.max()
                    mask_v = np.expand_dims(d_kernel, axis=2)
                    blurred_roi = (blurred_roi * mask_v).astype(np.uint8)
                elif style_name == 'High Contrast Halftone':
                    gray = cv2.cvtColor(blurred_roi, cv2.COLOR_BGR2GRAY)
                    _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
                    for c in range(3):
                        blurred_roi[:, :, c] = thresh
                elif style_name == 'Rainbow Spectral Blur':
                    b, g, r = cv2.split(roi)
                    b_b = cv2.GaussianBlur(b, (max(3, ksize - 4) | 1, max(3, ksize - 4) | 1), 0)
                    g_b = cv2.GaussianBlur(g, (ksize, ksize), 0)
                    r_b = cv2.GaussianBlur(r, (max(3, ksize + 4) | 1, max(3, ksize + 4) | 1), 0)
                    blurred_roi = cv2.merge([b_b, g_b, r_b])
                elif style_name == 'Monochrome Grayscale Blur':
                    gray = cv2.cvtColor(blurred_roi, cv2.COLOR_BGR2GRAY)
                    for c in range(3):
                        blurred_roi[:, :, c] = gray
                elif style_name == 'Inverted Color Blur':
                    blurred_roi = cv2.bitwise_not(blurred_roi)
                elif style_name == 'Double Exposure Blur':
                    shifted = np.roll(roi, ksize, axis=0)
                    blurred_roi = cv2.addWeighted(blurred_roi, 0.6, shifted, 0.4, 0)
                elif style_name == 'Soft Dreamy Glow':
                    blurred_roi = cv2.addWeighted(roi, 0.4, blurred_roi, 0.6, 0)

                # Apply shape masking
                if shape_type == 'Circle / Ellipse':
                    mask = np.zeros((y2 - y1, x2 - x1), dtype=np.uint8)
                    center = ((x2 - x1) // 2, (y2 - y1) // 2)
                    axes = ((x2 - x1) // 2, (y2 - y1) // 2)
                    cv2.ellipse(mask, center, axes, 0, 0, 360, 255, -1)
                    
                    feather_val = blur_conf.get('feather', 50)
                    if feather_val > 0:
                        max_kernel = min(x2 - x1, y2 - y1) // 2
                        max_kernel = max(5, max_kernel)
                        mask_blur_size = int((feather_val / 100.0) * max_kernel)
                        if mask_blur_size % 2 == 0:
                            mask_blur_size += 1
                        mask_blur_size = max(3, mask_blur_size)
                        feathered_mask = cv2.GaussianBlur(mask, (mask_blur_size, mask_blur_size), 0)
                    else:
                        feathered_mask = mask
                    
                    alpha = feathered_mask.astype(float) / 255.0
                    alpha = np.expand_dims(alpha, axis=2)
                    frame[y1:y2, x1:x2] = (alpha * blurred_roi + (1.0 - alpha) * roi).astype(np.uint8)
                else:
                    frame[y1:y2, x1:x2] = blurred_roi
                
                # Apply Neon Glow Border if style selected
                if style_name == 'Neon Glow Border Blur':
                    color = (255, 0, 127) # Neon Pink BGR
                    for th in range(1, 6):
                        cv2.rectangle(frame, (x1 - th, y1 - th), (x2 + th, y2 + th), color, 1)

    # Apply Watermark Second
    wm_conf = config.get('watermark')
    if wm_conf and wm_conf.get('path') and os.path.exists(wm_conf['path']):
        path = wm_conf['path']
        logo = cv2.imread(path, cv2.IMREAD_UNCHANGED)
        if logo is None:
            global _VIDEO_CAPTURES
            if '_VIDEO_CAPTURES' not in globals():
                _VIDEO_CAPTURES = {}
                
            if 'watermark' not in _VIDEO_CAPTURES or _VIDEO_CAPTURES.get('watermark_path') != path:
                if _VIDEO_CAPTURES.get('watermark'):
                    _VIDEO_CAPTURES['watermark'].release()
                _VIDEO_CAPTURES['watermark'] = cv2.VideoCapture(path)
                _VIDEO_CAPTURES['watermark_path'] = path
                
            cap = _VIDEO_CAPTURES['watermark']
            ret, logo = cap.read()
            if not ret:
                # Loop back to beginning
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, logo = cap.read()
                
            # Clean up old key if it exists to prevent pickle errors
            if '_cap' in wm_conf:
                del wm_conf['_cap']
            if '_cap_path' in wm_conf:
                del wm_conf['_cap_path']
            
        if logo is not None:
            import time
            t_val = time.time()
            wm_anim = wm_conf.get('animation', 'None')
            
            if wm_conf.get('green_screen'):
                key_color = wm_conf.get('key_color', 'Green')
                hsv = cv2.cvtColor(logo, cv2.COLOR_BGR2HSV)
                if key_color == 'Green':
                    mask = cv2.inRange(hsv, (36, 25, 25), (86, 255, 255))
                elif key_color == 'Blue':
                    mask = cv2.inRange(hsv, (90, 50, 50), (130, 255, 255))
                elif key_color == 'Black':
                    mask = cv2.inRange(hsv, (0, 0, 0), (180, 255, 50))
                elif key_color == 'White':
                    mask = cv2.inRange(hsv, (0, 0, 200), (180, 40, 255))
                else:
                    mask = cv2.inRange(hsv, (36, 25, 25), (86, 255, 255))
                
                alpha = 255 - mask
                if logo.shape[2] == 3:
                    b, g, r = cv2.split(logo)
                    logo = cv2.merge([b, g, r, alpha])
                else:
                    logo[:, :, 3] = cv2.bitwise_and(logo[:, :, 3], alpha)
            
            # Apply Rotation & Spin Animation
            angle = wm_conf.get('rotation', 0)
            if wm_anim == 'Continuous Spin':
                angle = (angle + int(t_val * 45)) % 360
            elif wm_anim == 'Vortex Spin':
                angle = (angle + int(t_val * 180)) % 360
            elif wm_anim in ['Rotate Oscillate', 'Swing Pendulum']:
                angle = angle + int(np.sin(t_val * 4.0) * 20)
                
            if angle != 0:
                h_orig, w_orig = logo.shape[:2]
                center = (w_orig // 2, h_orig // 2)
                M = cv2.getRotationMatrix2D(center, -angle, 1.0)
                cos = np.abs(M[0, 0])
                sin = np.abs(M[0, 1])
                new_w = int((h_orig * sin) + (w_orig * cos))
                new_h = int((h_orig * cos) + (w_orig * sin))
                M[0, 2] += (new_w / 2) - center[0]
                M[1, 2] += (new_h / 2) - center[1]
                if logo.shape[2] == 3:
                    alpha_ch = np.ones((logo.shape[0], logo.shape[1], 1), dtype=logo.dtype) * 255
                    logo = np.concatenate((logo, alpha_ch), axis=2)
                logo = cv2.warpAffine(logo, M, (new_w, new_h), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))

            scale = wm_conf.get('scale', 100) / 100.0
            if wm_anim == 'Pulse':
                scale = scale * (0.85 + abs(np.sin(t_val * 3.0)) * 0.25)
            elif wm_anim == 'Heartbeat':
                scale = scale * (1.25 if (int(seed_t := t_val * 2) % 2 == 0 and (seed_t - int(seed_t)) < 0.25) else 0.95)
            elif wm_anim == 'Zoom In-Out':
                scale = scale * (0.7 + abs(np.sin(t_val * 1.5)) * 0.5)
            elif wm_anim == 'Elastic Spring':
                scale = scale * (1.0 + np.sin(t_val * 5.0) * 0.15 * np.exp(-abs(np.sin(t_val * 0.5))))
            elif wm_anim == 'Vortex Spin':
                scale = scale * (0.5 + abs(np.sin(t_val * 2.0)) * 0.5)
                
            x_offset = wm_conf.get('x', 0)
            y_offset = wm_conf.get('y', 0)
            if wm_anim == 'Bounce':
                y_offset = y_offset - int(abs(np.sin(t_val * 3.5)) * 20)
            elif wm_anim == 'Horizontal Slide In':
                x_offset = x_offset + int(np.sin(t_val * 2.0) * 30)
            elif wm_anim == 'Vertical Drop':
                y_offset = y_offset + int(np.sin(t_val * 2.0) * 30)
            elif wm_anim == 'Wiggle Shiver':
                x_offset += int(np.sin(t_val * 25.0) * 4)
                y_offset += int(np.cos(t_val * 21.0) * 4)
            elif wm_anim == 'Circular Orbit':
                x_offset += int(np.sin(t_val * 3.0) * 15)
                y_offset += int(np.cos(t_val * 3.0) * 15)
            elif wm_anim == 'Glitch Jitter':
                seed_t = int(t_val * 15)
                if seed_t % 3 == 0:
                    x_offset += int((seed_t * 7) % 11 - 5)
                    y_offset += int((seed_t * 13) % 11 - 5)
            elif wm_anim == 'Wave Float':
                y_offset = y_offset + int(np.sin(t_val * 1.8) * 12)
            elif wm_anim == 'Slide & Fade':
                x_offset = x_offset + int(np.sin(t_val) * 20)
            elif wm_anim == 'Random Drift':
                x_offset += int(np.sin(t_val * 0.5) * 25)
                y_offset += int(np.cos(t_val * 0.7) * 25)
            elif wm_anim == 'Cinema Cinematic Slide':
                x_offset = x_offset + int(np.cos(t_val * 0.8) * 50)
            
            if scale != 1.0:
                width = int(logo.shape[1] * scale)
                height = int(logo.shape[0] * scale)
                if width > 0 and height > 0:
                    logo = cv2.resize(logo, (width, height), interpolation=cv2.INTER_AREA)
                    
            if logo.shape[2] == 3:
                alpha_channel = np.ones((logo.shape[0], logo.shape[1], 1), dtype=logo.dtype) * 255
                logo = np.concatenate((logo, alpha_channel), axis=2)
                
            y1, y2 = y_offset, y_offset + logo.shape[0]
            x1, x2 = x_offset, x_offset + logo.shape[1]
            
            fh, fw = frame.shape[:2]
            if not (y1 >= fh or x1 >= fw or y2 <= 0 or x2 <= 0):
                logo_y1 = max(0, -y1)
                logo_x1 = max(0, -x1)
                logo_y2 = logo.shape[0] - max(0, y2 - fh)
                logo_x2 = logo.shape[1] - max(0, x2 - fw)
                
                y1 = max(0, y1)
                x1 = max(0, x1)
                y2 = min(fh, y2)
                x2 = min(fw, x2)
                
                logo_crop = logo[logo_y1:logo_y2, logo_x1:logo_x2]
                
                # Apply Opacity & Fade In-Out Animation
                opacity_val = wm_conf.get('opacity', 100) / 100.0
                if wm_anim == 'Fade In-Out':
                    opacity_val = opacity_val * (0.3 + abs(np.sin(t_val * 2.0)) * 0.7)
                elif wm_anim == 'Flicker Flash':
                    opacity_val = opacity_val * (0.25 if int(t_val * 10) % 2 == 0 else 1.0)
                elif wm_anim == 'Slide & Fade':
                    opacity_val = opacity_val * (0.2 + abs(np.sin(t_val)) * 0.8)
                
                # Apply Visual Filters
                wm_filter = wm_conf.get('filter', 'None')
                if wm_filter != 'None':
                    bgr = logo_crop[:, :, :3].copy()
                    if wm_filter == 'Vibrant':
                        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
                        hsv[:, :, 1] = cv2.add(hsv[:, :, 1], 40)
                        bgr = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
                    elif wm_filter == 'Cyberpunk Cyan-Pink':
                        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
                        pink = np.array([127, 0, 255])
                        cyan = np.array([255, 243, 0])
                        for c in range(3):
                            bgr[:, :, c] = (gray / 255.0 * pink[c] + (1.0 - gray / 255.0) * cyan[c]).astype(np.uint8)
                    elif wm_filter == 'Neon Glow':
                        glow = cv2.GaussianBlur(bgr, (9, 9), 0)
                        bgr = cv2.addWeighted(bgr, 1.0, glow, 0.7, 0)
                    elif wm_filter == 'Retro VHS Scanline':
                        for r in range(0, bgr.shape[0], 4):
                            bgr[r, :, :] = (bgr[r, :, :] * 0.4).astype(np.uint8)
                    elif wm_filter == 'Monochrome (Black & White)':
                        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
                        for c in range(3):
                            bgr[:, :, c] = gray
                    elif wm_filter == 'Vintage Sepia':
                        sepia_kernel = np.array([[0.272, 0.534, 0.131],
                                                 [0.349, 0.686, 0.168],
                                                 [0.393, 0.769, 0.189]])
                        bgr = cv2.transform(bgr, sepia_kernel)
                    elif wm_filter == 'Warm Cinematic':
                        bgr[:, :, 2] = cv2.add(bgr[:, :, 2], 30)
                        bgr[:, :, 0] = cv2.subtract(bgr[:, :, 0], 15)
                    elif wm_filter == 'Cool Ice':
                        bgr[:, :, 0] = cv2.add(bgr[:, :, 0], 35)
                        bgr[:, :, 2] = cv2.subtract(bgr[:, :, 2], 15)
                    elif wm_filter == 'Gold Foil Sheen':
                        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
                        gold_bgr = np.array([32, 165, 218])
                        for c in range(3):
                            bgr[:, :, c] = (gray / 255.0 * gold_bgr[c]).astype(np.uint8)
                    elif wm_filter == 'Glitch Aberration':
                        shift = 3
                        r_ch = bgr[:, :, 2]
                        b_ch = bgr[:, :, 0]
                        r_shift = np.roll(r_ch, shift, axis=1)
                        b_shift = np.roll(b_ch, -shift, axis=1)
                        bgr[:, :, 2] = r_shift
                        bgr[:, :, 0] = b_shift
                    elif wm_filter == 'Glassmorphism Blur':
                        bgr = cv2.GaussianBlur(bgr, (15, 15), 0)
                    elif wm_filter == 'Half Opacity Silhouette':
                        bgr[:, :, :] = 30
                        logo_crop[:, :, 3] = (logo_crop[:, :, 3] * 0.5).astype(np.uint8)
                    elif wm_filter == 'Electric Violet Highlight':
                        bgr[:, :, 0] = cv2.add(bgr[:, :, 0], 40)
                        bgr[:, :, 2] = cv2.add(bgr[:, :, 2], 40)
                    elif wm_filter == 'Fire Glow Outline':
                        glow = cv2.GaussianBlur(bgr, (7, 7), 0)
                        glow[:, :, 0] = 0
                        glow[:, :, 1] = (glow[:, :, 1] * 0.5).astype(np.uint8)
                        bgr = cv2.addWeighted(bgr, 1.0, glow, 0.8, 0)
                    elif wm_filter == 'Metallic Chrome':
                        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
                        _, chrome = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)
                        for c in range(3):
                            bgr[:, :, c] = chrome
                    elif wm_filter == 'Old Film Grain':
                        noise = np.random.normal(0, 15, bgr.shape).astype(np.int16)
                        bgr = np.clip(bgr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
                    elif wm_filter == 'Ghost Glow':
                        glow = cv2.GaussianBlur(bgr, (15, 15), 0)
                        bgr = cv2.addWeighted(bgr, 0.6, glow, 0.6, 0)
                        logo_crop[:, :, 3] = (logo_crop[:, :, 3] * 0.7).astype(np.uint8)
                    elif wm_filter == 'Vaporwave Pastel':
                        hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
                        hsv[:, :, 1] = (hsv[:, :, 1] * 0.5).astype(np.uint8)
                        hsv[:, :, 2] = cv2.add(hsv[:, :, 2], 50)
                        bgr = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
                    elif wm_filter == 'High Contrast Accent':
                        bgr = cv2.convertScaleAbs(bgr, alpha=1.4, beta=-20)
                    logo_crop[:, :, :3] = bgr

                alpha = (logo_crop[:, :, 3] / 255.0) * opacity_val
                alpha_inv = 1.0 - alpha
                
                for c in range(0, 3):
                    frame[y1:y2, x1:x2, c] = (alpha * logo_crop[:, :, c] + alpha_inv * frame[y1:y2, x1:x2, c])
                    
    # Apply Text Third
    text_conf = config.get('text')
    if text_conf and text_conf.get('text'):
        text_str = text_conf['text']
        x, y = text_conf['x'], text_conf['y']
        size = text_conf.get('size', 50)
        color_name = text_conf.get('color', 'White')
        font_path = text_conf.get('font', '')
        
        anim = text_conf.get('animation', 'None')
        outline_w = text_conf.get('outline_width', 0)
        outline_color = text_conf.get('outline_color', 'Black')
        bg_style = text_conf.get('bg_style', 'None')
        
        try:
            from PyQt5.QtGui import QImage, QPainter, QFont, QColor, QFontMetrics, QFontDatabase, QPen, QBrush, QLinearGradient, QPainterPath
            import numpy as np
            import os
            import time
            
            t_val = time.time()
            
            # Position/Size Animations for Live Preview
            fh, fw = frame.shape[:2]
            
            # Temp w, h estimation for scroll bounds
            temp_w = len(text_str) * (size // 2) + 40
            
            if anim == "Scroll L-to-R":
                x = int((t_val * 100) % (fw + temp_w)) - temp_w
            elif anim == "Scroll R-to-L":
                x = fw - int((t_val * 100) % (fw + temp_w))
            elif anim == "Bounce":
                y = y - int(abs(np.sin(t_val * 4)) * 35)
            elif anim == "Wiggle":
                x = x + int(np.sin(t_val * 16) * 6)
                y = y + int(np.cos(t_val * 13) * 5)
            elif anim == "Pulse":
                scale_factor = 0.85 + abs(np.sin(t_val * 3.5)) * 0.25
                size = int(size * scale_factor)
            elif anim == "Heartbeat Jump":
                if int(t_val * 2) % 2 == 0 and (t_val * 2 - int(t_val * 2)) < 0.25:
                    y -= 25
                    size = int(size * 1.2)
            elif anim == "Flicker Reveal":
                if int(t_val * 12) % 3 == 0:
                    text_str = ""
            elif anim == "Typewriter Effect":
                char_count = int(t_val * 10) % (len(text_str) + 5)
                text_str = text_str[:max(1, min(len(text_str), char_count))]
            elif anim == "Zoom In Pop":
                pop_val = abs(np.sin(t_val * 2.0))
                size = int(size * (0.8 + pop_val * 0.4))
            elif anim == "Wave Dance":
                y = y + int(np.sin(t_val * 6.0 + x * 0.05) * 15)
            elif anim in ["Slide Up Fade", "Slide Down Fade"]:
                slide_cycle = (t_val * 1.5) % 1.0
                if anim == "Slide Up Fade":
                    y = y + 25 - int(slide_cycle * 25)
                else:
                    y = y - 25 + int(slide_cycle * 25)
            elif anim == "Continuous Spin":
                text_conf['rotation'] = (text_conf.get('rotation', 0) + int(t_val * 90)) % 360
            elif anim == "Jitter Glitch":
                seed_t = int(t_val * 20)
                if seed_t % 2 == 0:
                    x += int((seed_t * 3) % 9 - 4)
                    y += int((seed_t * 7) % 9 - 4)
            elif anim == "Elastic Stretch":
                size = int(size * (1.0 + np.sin(t_val * 6.0) * 0.15 * np.exp(-abs(np.sin(t_val * 0.5)))))
            elif anim == "Circular Drift":
                x = x + int(np.sin(t_val * 4.0) * 15)
                y = y + int(np.cos(t_val * 4.0) * 15)
            elif anim == "Fading Teleport":
                cycle_step = int(t_val * 2.0) % 4
                if cycle_step == 0:
                    x += 20
                elif cycle_step == 2:
                    x -= 20
            elif anim == "Swing Pendulum":
                text_conf['rotation'] = text_conf.get('rotation', 0) + int(np.sin(t_val * 4.0) * 20)
            font = QFont()
            if font_path and os.path.exists(font_path):
                if font_path not in _LOADED_FONTS:
                    font_id = QFontDatabase.addApplicationFont(font_path)
                    if font_id != -1:
                        family = QFontDatabase.applicationFontFamilies(font_id)[0]
                        _LOADED_FONTS[font_path] = family
                    else:
                        _LOADED_FONTS[font_path] = None
                family = _LOADED_FONTS[font_path]
                if family:
                    font = QFont(family, size)
                else:
                    font = QFont("DaunPenh", size)
            else:
                font = QFont("DaunPenh", size)
                
            fm = QFontMetrics(font)
            rect = fm.boundingRect(QRect(0, 0, 4000, 4000), Qt.AlignLeft | Qt.AlignTop, text_str if text_str else " ")
            pad_x, pad_y = 20, 18
            w = max(rect.width() + pad_x * 2, 10)
            h = max(fm.height() + pad_y * 2, 10)
            
            img = QImage(w, h, QImage.Format_ARGB32)
            img.fill(Qt.transparent)
            
            painter = QPainter(img)
            painter.setRenderHint(QPainter.Antialiasing)
            painter.setRenderHint(QPainter.TextAntialiasing)
            
            # Draw Background Box
            if bg_style and bg_style != "None":
                if bg_style == "Semi-Transparent Black":
                    painter.setBrush(QBrush(QColor(0, 0, 0, 160)))
                    painter.setPen(Qt.NoPen)
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 8, 8)
                elif bg_style == "Dark Glassmorphism":
                    painter.setBrush(QBrush(QColor(15, 23, 42, 180)))
                    painter.setPen(QPen(QColor(255, 255, 255, 40), 1))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 12, 12)
                elif bg_style == "Neon Border Box":
                    painter.setBrush(QBrush(QColor(5, 5, 10, 220)))
                    painter.setPen(QPen(QColor(0, 243, 255), 2))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 6, 6)
                elif bg_style == "Gradient Slide Box":
                    grad = QLinearGradient(10, 0, w - 10, 0)
                    grad.setColorAt(0, QColor(0, 102, 255, 200))
                    grad.setColorAt(1, QColor(0, 243, 255, 200))
                    painter.setBrush(QBrush(grad))
                    painter.setPen(Qt.NoPen)
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 10, 10)
                elif bg_style == "Retro VHS Rounded Box":
                    painter.setBrush(QBrush(QColor(10, 10, 10, 240)))
                    painter.setPen(QPen(QColor(255, 220, 0), 2))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 4, 4)
                elif bg_style == "Frosted Cyberpunk Box":
                    painter.setBrush(QBrush(QColor(255, 0, 127, 80)))
                    painter.setPen(QPen(QColor(0, 243, 255), 1))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 8, 8)
                elif bg_style == "Cyber Neon Pink Box":
                    painter.setBrush(QBrush(QColor(15, 5, 25, 210)))
                    painter.setPen(QPen(QColor(255, 0, 180), 2))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 8, 8)
                elif bg_style == "Retro Yellow Subtitle Box":
                    painter.setBrush(QBrush(QColor(20, 20, 20, 220)))
                    painter.setPen(QPen(QColor(255, 230, 0), 1.5))
                    painter.drawRect(QRect(10, 8, w - 20, h - 16))
                elif bg_style == "Transparent White Glass":
                    painter.setBrush(QBrush(QColor(255, 255, 255, 45)))
                    painter.setPen(QPen(QColor(255, 255, 255, 120), 1.5))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 14, 14)
                elif bg_style == "Vaporwave Grid Box":
                    painter.setBrush(QBrush(QColor(30, 10, 45, 225)))
                    painter.setPen(QPen(QColor(255, 0, 255, 80), 1))
                    painter.drawRect(QRect(10, 8, w - 20, h - 16))
                    grid_pen = QPen(QColor(255, 0, 255, 60), 1)
                    painter.setPen(grid_pen)
                    for gy in range(12, h - 12, 8):
                        painter.drawLine(10, gy, w - 10, gy)
                elif bg_style == "Classic Cinema Black Bar":
                    painter.setBrush(QBrush(QColor(0, 0, 0, 255)))
                    painter.setPen(Qt.NoPen)
                    painter.drawRect(QRect(0, 0, w, h))
                elif bg_style == "Electric Blue Border Box":
                    painter.setBrush(QBrush(QColor(0, 10, 30, 210)))
                    painter.setPen(QPen(QColor(0, 120, 255), 2))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 8, 8)
                elif bg_style == "Soft Shadow Plate":
                    painter.setBrush(QBrush(QColor(40, 40, 40, 180)))
                    painter.setPen(Qt.NoPen)
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 10, 10)
                elif bg_style == "Burning Fire Box":
                    grad = QLinearGradient(10, 8, 10, h - 16)
                    grad.setColorAt(0, QColor(255, 69, 0, 200))
                    grad.setColorAt(1, QColor(255, 140, 0, 100))
                    painter.setBrush(QBrush(grad))
                    painter.setPen(QPen(QColor(255, 69, 0), 1.5))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 8, 8)
                elif bg_style == "Ice Castle Box":
                    grad = QLinearGradient(10, 8, w - 10, h - 16)
                    grad.setColorAt(0, QColor(0, 191, 255, 120))
                    grad.setColorAt(1, QColor(240, 248, 255, 160))
                    painter.setBrush(QBrush(grad))
                    painter.setPen(QPen(QColor(255, 255, 255, 200), 1.5))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 10, 10)
                elif bg_style == "Golden Border Ribbon":
                    painter.setBrush(QBrush(QColor(15, 15, 15, 230)))
                    painter.setPen(Qt.NoPen)
                    painter.drawRect(QRect(10, 8, w - 20, h - 16))
                    gold_grad = QLinearGradient(10, 0, w - 10, 0)
                    gold_grad.setColorAt(0.0, QColor(180, 130, 30))
                    gold_grad.setColorAt(0.5, QColor(255, 220, 100))
                    gold_grad.setColorAt(1.0, QColor(180, 130, 30))
                    painter.setPen(QPen(gold_grad, 2))
                    painter.drawLine(10, 8, w - 10, 8)
                    painter.drawLine(10, h - 9, w - 10, h - 9)
                elif bg_style == "Comic Book Speech Plate":
                    painter.setBrush(QBrush(QColor(255, 255, 255, 255)))
                    painter.setPen(QPen(QColor(0, 0, 0), 3.5))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 6, 6)
                elif bg_style == "Carbon Fiber Tech Plate":
                    painter.setBrush(QBrush(QColor(20, 20, 22, 240)))
                    painter.setPen(QPen(QColor(60, 60, 65), 1))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 6, 6)
                    painter.setPen(QPen(QColor(255, 255, 255, 12), 1))
                    for stripe in range(-h, w + h, 6):
                        painter.drawLine(stripe, 8, stripe + h, h - 8)
                elif bg_style == "Sunset Gradient Frame":
                    grad = QLinearGradient(10, 8, w - 10, h - 16)
                    grad.setColorAt(0.0, QColor(255, 90, 95, 140))
                    grad.setColorAt(1.0, QColor(255, 200, 80, 140))
                    painter.setBrush(QBrush(grad))
                    painter.setPen(QPen(QColor(255, 120, 100), 1.5))
                    painter.drawRoundedRect(QRect(10, 8, w - 20, h - 16), 10, 10)
            
            # Centering Math Calculations
            bx = pad_x - rect.x()
            by = pad_y + fm.ascent()
            
            # Setup path
            path = QPainterPath()
            path.addText(bx, by, font, text_str)
            
            # Draw Shadow/Glow
            shadow_glow = text_conf.get('shadow_glow', 'None')
            if shadow_glow and shadow_glow != "None":
                if shadow_glow == "Soft Shadow":
                    painter.fillPath(path.translated(2, 2), QColor(0, 0, 0, 128))
                elif shadow_glow == "Hard Shadow":
                    painter.fillPath(path.translated(3, 3), QColor(0, 0, 0, 255))
                elif shadow_glow == "TikTok Offset Glow":
                    painter.fillPath(path.translated(-2.5, 0), QColor(0, 243, 255, 180))
                    painter.fillPath(path.translated(2.5, 0), QColor(255, 0, 127, 180))
                elif shadow_glow == "Vaporwave Magenta Glow":
                    for dx, dy in [(-2, -2), (2, -2), (-2, 2), (2, 2), (0, -2), (0, 2), (-2, 0), (2, 0)]:
                        painter.fillPath(path.translated(dx, dy), QColor(255, 0, 255, 60))
                elif shadow_glow == "Cinema Ambient Glow":
                    painter.fillPath(path.translated(0, 3.5), QColor(0, 0, 0, 100))
                elif shadow_glow == "Neon Glow Cyan":
                    for dx, dy in [(-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, -2), (-2, 2), (2, 2)]:
                        painter.fillPath(path.translated(dx * 0.8, dy * 0.8), QColor(0, 243, 255, 50))
                elif shadow_glow == "Neon Glow Pink":
                    for dx, dy in [(-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, -2), (-2, 2), (2, 2)]:
                        painter.fillPath(path.translated(dx * 0.8, dy * 0.8), QColor(255, 0, 180, 50))
                elif shadow_glow == "Neon Glow Yellow":
                    for dx, dy in [(-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, -2), (-2, 2), (2, 2)]:
                        painter.fillPath(path.translated(dx * 0.8, dy * 0.8), QColor(255, 220, 0, 50))
                elif shadow_glow == "Deep 3D Shadow":
                    for offset in range(1, 6):
                        painter.fillPath(path.translated(offset, offset), QColor(20, 20, 20, 255))
                elif shadow_glow == "Double Glitch Glow":
                    painter.fillPath(path.translated(-3.5, -1.5), QColor(255, 0, 0, 140))
                    painter.fillPath(path.translated(3.5, 1.5), QColor(0, 0, 255, 140))
                elif shadow_glow == "Red Laser Glow":
                    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2)]:
                        painter.fillPath(path.translated(dx, dy), QColor(255, 30, 0, 90))
                elif shadow_glow == "Green Matrix Glow":
                    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2)]:
                        painter.fillPath(path.translated(dx, dy), QColor(0, 255, 60, 90))
                elif shadow_glow == "Electric Violet Halo":
                    for dx, dy in [(-3, 0), (3, 0), (0, -3), (0, 3)]:
                        painter.fillPath(path.translated(dx, dy), QColor(187, 0, 255, 80))
                elif shadow_glow == "Sunset Orange Aura":
                    for dx, dy in [(-2, -2), (2, -2), (-2, 2), (2, 2)]:
                        painter.fillPath(path.translated(dx, dy), QColor(255, 100, 0, 80))
                elif shadow_glow == "Golden Crown Outline":
                    for dx, dy in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
                        painter.fillPath(path.translated(dx, dy), QColor(212, 175, 55, 120))
                elif shadow_glow == "Ghostly Ice Glow":
                    for dx, dy in [(-4, 0), (4, 0), (0, -4), (0, 4)]:
                        painter.fillPath(path.translated(dx * 0.7, dy * 0.7), QColor(200, 240, 255, 60))
                elif shadow_glow == "Vaporwave Grid Shadow":
                    painter.fillPath(path.translated(4, 4), QColor(120, 0, 120, 180))
                elif shadow_glow == "Comic Outline Thick":
                    for dx in range(-3, 4):
                        for dy in range(-3, 4):
                            if dx != 0 or dy != 0:
                                painter.fillPath(path.translated(dx, dy), QColor(0, 0, 0, 255))
                elif shadow_glow == "Subtle Warm Under-Glow":
                    painter.fillPath(path.translated(0, 3), QColor(255, 150, 100, 100))
            
            # Draw outline
            if outline_w > 0:
                outline_qcolor = QColor(0, 0, 0)
                outline_map = {
                    'Black': QColor(0, 0, 0),
                    'White': QColor(255, 255, 255),
                    'Red': QColor(255, 50, 50),
                    'Blue': QColor(0, 150, 255),
                    'Green': QColor(0, 230, 118),
                    'Yellow': QColor(255, 220, 0),
                    'Gray': QColor(100, 100, 100)
                }
                outline_qcolor = outline_map.get(outline_color, QColor(0, 0, 0))
                pen = QPen(outline_qcolor, outline_w * 2)
                pen.setJoinStyle(Qt.RoundJoin)
                painter.setPen(pen)
                painter.drawPath(path)
            
            # Fill Path (Solid or Premium Gradients)
            painter.setPen(Qt.NoPen)
            brush = QBrush(QColor(255, 255, 255))
            
            if color_name == 'White':
                brush = QBrush(QColor(255, 255, 255))
            elif color_name == 'Black':
                brush = QBrush(QColor(0, 0, 0))
            elif color_name == 'Red':
                brush = QBrush(QColor(255, 50, 50))
            elif color_name == 'Yellow':
                brush = QBrush(QColor(255, 220, 0))
            elif color_name == 'Green':
                brush = QBrush(QColor(0, 230, 118))
            elif color_name == 'Blue':
                brush = QBrush(QColor(0, 150, 255))
            elif color_name == 'TikTok Glitch Style':
                painter.fillPath(path.translated(-2, 0), QColor(0, 243, 255, 220))
                painter.fillPath(path.translated(2, 0), QColor(255, 0, 127, 220))
                brush = QBrush(QColor(255, 255, 255))
            elif color_name == 'Neon Mint-Green':
                brush = QBrush(QColor(10, 255, 150))
            elif color_name == 'Electric Violet':
                brush = QBrush(QColor(187, 0, 255))
            elif color_name == 'Retro Vaporwave':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                grad.setColorAt(0.0, QColor(155, 0, 250))
                grad.setColorAt(1.0, QColor(255, 120, 180))
                brush = QBrush(grad)
            elif color_name == 'Silver Metallic':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                grad.setColorAt(0.0, QColor(120, 120, 130))
                grad.setColorAt(0.5, QColor(255, 255, 255))
                grad.setColorAt(1.0, QColor(150, 150, 160))
                brush = QBrush(grad)
            elif color_name == 'Fire Flame':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                grad.setColorAt(0.0, QColor(255, 30, 0))
                grad.setColorAt(0.5, QColor(255, 140, 0))
                grad.setColorAt(1.0, QColor(255, 230, 0))
                brush = QBrush(grad)
            elif color_name == 'Ice & Snow':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                grad.setColorAt(0.0, QColor(160, 220, 255))
                grad.setColorAt(1.0, QColor(255, 255, 255))
                brush = QBrush(grad)
            elif color_name == 'Rainbow Gradient':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                grad.setColorAt(0.0, QColor(255, 0, 0))
                grad.setColorAt(0.2, QColor(255, 150, 0))
                grad.setColorAt(0.4, QColor(255, 255, 0))
                grad.setColorAt(0.6, QColor(0, 255, 0))
                grad.setColorAt(0.8, QColor(0, 150, 255))
                grad.setColorAt(1.0, QColor(150, 0, 255))
                brush = QBrush(grad)
            elif color_name == 'Rainbow Cycle':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                colors_list = [QColor(255, 0, 0), QColor(255, 150, 0), QColor(255, 255, 0),
                               QColor(0, 255, 0), QColor(0, 150, 255), QColor(150, 0, 255)]
                for stop_idx in range(6):
                    stop_pos = (stop_idx / 5.0 + t_val * 0.5) % 1.0
                    grad.setColorAt(stop_pos, colors_list[stop_idx])
                brush = QBrush(grad)
            elif color_name == 'Neon Sunset':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                grad.setColorAt(0.0, QColor(255, 0, 100))
                grad.setColorAt(0.5, QColor(255, 120, 0))
                grad.setColorAt(1.0, QColor(100, 0, 200))
                brush = QBrush(grad)
            elif color_name == 'Cyberpunk Pink-Cyan':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                grad.setColorAt(0.0, QColor(255, 0, 180))
                grad.setColorAt(1.0, QColor(0, 243, 255))
                brush = QBrush(grad)
            elif color_name == 'Golden Luxury':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                grad.setColorAt(0.0, QColor(180, 130, 30))
                grad.setColorAt(0.5, QColor(255, 220, 100))
                grad.setColorAt(1.0, QColor(180, 130, 30))
                brush = QBrush(grad)
            elif color_name == 'Rose Gold Gradient':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                grad.setColorAt(0.0, QColor(235, 160, 160))
                grad.setColorAt(0.5, QColor(245, 220, 200))
                grad.setColorAt(1.0, QColor(190, 130, 130))
                brush = QBrush(grad)
            elif color_name == 'Emerald Forest':
                grad = QLinearGradient(bx, 0, bx + rect.width(), 0)
                grad.setColorAt(0.0, QColor(0, 70, 40))
                grad.setColorAt(0.5, QColor(10, 200, 110))
                grad.setColorAt(1.0, QColor(150, 250, 200))
                brush = QBrush(grad)
            
            painter.fillPath(path, brush)
            painter.end()
            
            # Apply QTransform Rotation
            text_rot = text_conf.get('rotation', 0)
            if text_rot != 0:
                from PyQt5.QtGui import QTransform
                transform = QTransform().rotate(text_rot)
                img = img.transformed(transform, Qt.SmoothTransformation)
            
            ptr = img.bits()
            ptr.setsize(img.byteCount())
            text_arr = np.array(ptr).reshape(img.height(), img.width(), 4)
            
            overlay_x, overlay_y = x - 20, y - 20
            
            x1 = max(0, overlay_x)
            y1 = max(0, overlay_y)
            x2 = min(fw, overlay_x + img.width())
            y2 = min(fh, overlay_y + img.height())
            
            if x2 > x1 and y2 > y1:
                tx1 = x1 - overlay_x
                ty1 = y1 - overlay_y
                tx2 = tx1 + (x2 - x1)
                ty2 = ty1 + (y2 - y1)
                
                text_crop = text_arr[ty1:ty2, tx1:tx2]
                alpha = text_crop[:, :, 3] / 255.0
                
                # Apply Pulse Opacity locally if selected
                if anim == "Pulse":
                    alpha = alpha * (0.65 + abs(np.sin(t_val * 4)) * 0.35)
                    
                alpha_inv = 1.0 - alpha
                
                for c in range(3):
                    frame[y1:y2, x1:x2, c] = (alpha * text_crop[:, :, c] + alpha_inv * frame[y1:y2, x1:x2, c])
        except Exception as e:
            print(f"Error rendering text overlay: {e}")
            
    return frame
