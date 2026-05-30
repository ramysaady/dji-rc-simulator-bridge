# 🎮 DJI RC-N1/RC-N1C Simulator Bridge

A high-performance, real-time Python & Web-based bridge that enables you to use your physical **DJI RC-N1** or **DJI RC-N1C** drone controller as a virtual USB Gamepad on your PC. Ideal for drone flight simulators like **Liftoff**, **Velocidrone**, **Uncrashed**, **FPV Freerider**, **DCL**, and **DJI Flight Simulator**.

---

## 🚀 Key Features

*   **⚡ Ultra-Low Latency & High Frequency:** Polls and maps telemetry data at **100Hz** for a smooth, lag-free simulator flight experience.
*   **🎮 Xbox 360 Controller Emulation:** Emulates a standard Xbox 360 Controller using the robust `vgamepad` package.
*   **🖥️ Modern Web Dashboard:** A stunning, responsive HTML5 local dashboard running at `http://localhost:8080` showcasing:
    *   Real-time 2D visualizers for left & right sticks.
    *   Interactive stick axis calibration & curves.
    *   Live connection status, signal rate (packets/sec), and port diagnostics.
    *   Configuration controls: **Invert axes**, **Swap sticks**, and change **Stick Modes** (Mode 1, Mode 2, Mode 3, Mode 4).
*   **🛠️ Plug-and-Play Driver Integration:** Automatically searches for and connects to the DJI controller via virtual COM ports.
*   **💾 Auto-Save Settings:** Your settings are immediately saved into `config.json` and persist across sessions.

---

## 📊 Dashboard Preview

When running, the bridge serves a local dashboard with smooth glassmorphic designs, vibrant gradient stick trajectories, and full parameter adjustments.

---

## 🛠️ Prerequisites & Setup

To get your controller working, you need to prepare the virtual controller drivers and DJI COM drivers:

### 1. Drivers Installation (Mandatory)
*   **DJI Virtual COM Drivers:** Install **[DJI Assistant 2 (Consumer Drones Series)](https://www.dji.com/downloads/softwares/dji-assistant-2-consumer-drones-series)**. This installs the necessary `DJI USB VCOM` drivers so Windows can read data from the controller's USB-C port.
    *   *Warning:* Close DJI Assistant 2 before running the bridge, as they cannot share the serial port at the same time.
*   **Virtual Gamepad Driver:** Install the **[ViGEmBus Driver](https://github.com/ViGEm/ViGEmBus/releases)**. This is the underlying system driver that creates the virtual Xbox 360 controller.

### 2. Physical Setup
1.  Connect your DJI RC-N1/RC-N1C controller to your PC using a high-quality USB-C cable connected to the **bottom USB-C port** (the one used for charging, not the top clamp cable).
2.  Turn on the controller (Press once, then press and hold).

### 3. Installation from Source
If running from source, clone the repository, install Python 3.8+, and run:

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/dji-rc-simulator-bridge.git
cd dji-rc-simulator-bridge

# Install Python requirements
pip install -r requirements.txt
```

---

## ⚡ How to Run

### Method 1: The Quick Launcher (Recommended)
Simply double-click the **`Run_DJI_Bridge.bat`** file.
*   This will automatically open the Web Dashboard in your default browser (`http://localhost:8080`).
*   It will launch the Python telemetry bridge in a background terminal.

### Method 2: Command Line
Start the service manually using Python:
```bash
python dji_bridge.py
```

### Method 3: Command Line (Simple CLI Version)
For a terminal-only experience with telemetry statistics and debugging:
```bash
python dji.py
```
### Method 4: Standalone Executable (No Python required!)
If you downloaded the compiled executable or have `dji_bridge.exe` in your folder:
* Simply double-click **`dji_bridge.exe`**.
* This will launch the background telemetry service and automatically open the Web Dashboard in your default browser (`http://localhost:8080`).

---

## ⚙️ Configuration & Customization

All configurations are manageable through the **Web Dashboard** or by modifying `config.json` directly:

```json
{
    "invert_lx": false,
    "invert_ly": false,
    "invert_rx": false,
    "invert_ry": false,
    "swap_sticks": false,
    "camera_threshold": 25000,
    "mode": 2
}
```

*   **`mode`**: Choose stick layout (Mode 2 is default: Left stick = Throttle/Yaw, Right stick = Pitch/Roll).
*   **`swap_sticks`**: Instantly swaps left and right stick functionalities.
*   **`invert_`**: Inverts joystick direction for individual axes.
*   **`camera_threshold`**: Adjusts the sensitivity of the gimbal wheel mapping (Mapped to Xbox `A` & `B` buttons).

---

## 🔍 How It Works (Under the Hood)

1.  **Handshake Protocol:** The script sends a custom DJI serial handshake command:  
    `55 0d 04 33 0a 06 eb 34 40 06 01 74 24` to trigger the serial data telemetry stream.
2.  **Telemetry Parsing:** The controller streams back **38-byte packets**. The python script captures these packets, extracts the raw stick values (ranging from `364` to `1684` with center at `1024`), and maps them to standard virtual controller axes (`-32768` to `32767`).
3.  **Virtual Emulation:** Telemetry values are fed directly to `vgamepad` which updates the virtual Xbox controller.
4.  **Local Web Server:** A background threaded HTTP server broadcasts the inputs as Server-Sent Events (SSE) to the frontend, providing immediate response visualizations with zero impact on polling speed.

---

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Made with ❤️ for the drone simulator community. Happy flying! 🚁*
