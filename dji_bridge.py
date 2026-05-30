import struct
import sys
import threading
import os
import time
import json
from datetime import datetime
import serial.tools.list_ports
import vgamepad as vg
from http.server import BaseHTTPRequestHandler
from socketserver import ThreadingTCPServer

# Helper to resolve resource paths (works for local development and PyInstaller bundles)
def get_resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# Configuration dictionary with defaults
config = {
    'invert_lx': False,
    'invert_ly': False,
    'invert_rx': False,
    'invert_ry': False,
    'swap_sticks': False,
    'camera_threshold': 25000,
    'mode': 2 # Mode 2 (Default: Left = Yaw/Throttle, Right = Roll/Pitch)
}

# Load config from file if exists
CONFIG_FILE = 'config.json'
if os.path.exists(CONFIG_FILE):
    try:
        with open(CONFIG_FILE, 'r') as f:
            saved_config = json.load(f)
            config.update(saved_config)
    except Exception as e:
        print(f"Error loading config.json: {e}")

# Live State dictionary
state = {
    'rx': 0, 'ry': 0, 
    'lx': 0, 'ly': 0, 
    'camera': 0,
    'raw_rx': 0, 'raw_ry': 0,
    'raw_lx': 0, 'raw_ly': 0,
    'raw_camera': 0,
    'connected': False,
    'port_name': 'None',
    'packets_received': 0
}

# Global references
serial_port = None
stop_thread = threading.Event()
gamepad = vg.VX360Gamepad()
DJI_PORT_DESCRIPTIONS = ['DJI USB VCOM For Protocol', 'DEVICE USB VCOM For Protocol', 'DJI USB VCOM']

# Maps for Xbox Buttons
buttons = {
    'A': vg.XUSB_BUTTON.XUSB_GAMEPAD_A,
    'B': vg.XUSB_BUTTON.XUSB_GAMEPAD_B,
}

# Convert DJI RC values to VGamePad values
# DJI min 364 -> VGamepad -32767, center 1024 -> 0, max 1684 -> 32767
def parse_input(byte_data):
    input_to_int = int.from_bytes(byte_data, byteorder='little')
    # Clamp inputs just in case
    input_to_int = max(364, min(1684, input_to_int))
    output = int((input_to_int - 1024) * (32767 + 32768) / (1684 - 364))
    return output, input_to_int

# Background thread to update virtual gamepad state
def gamepad_thread_func():
    print("Virtual Gamepad Thread Started.")
    gamepad.reset()
    try:
        while not stop_thread.is_set():
            # Process state based on configuration settings
            lx = state['lx']
            ly = state['ly']
            rx = state['rx']
            ry = state['ry']
            camera = state['camera']

            # Swap sticks if configured
            if config['swap_sticks']:
                lx, rx = rx, lx
                ly, ry = ry, ly

            # Apply Inversions
            if config['invert_lx']: lx = -lx
            if config['invert_ly']: ly = -ly
            if config['invert_rx']: rx = -rx
            if config['invert_ry']: ry = -ry

            # Feed to gamepad
            gamepad.left_joystick(int(lx), int(ly))
            gamepad.right_joystick(int(rx), int(ry))

            # Camera control dial mapping to buttons
            threshold = config['camera_threshold']
            if camera >= threshold:
                gamepad.release_button(buttons['A'])
                gamepad.press_button(buttons['B'])
            elif camera <= -threshold:
                gamepad.release_button(buttons['B'])
                gamepad.press_button(buttons['A'])
            else:
                gamepad.release_button(buttons['A'])
                gamepad.release_button(buttons['B'])

            gamepad.update()
            time.sleep(0.01) # 100Hz updates
    except Exception as ex:
        print(f"Error in Gamepad Thread: {ex}")

# Background thread to handle serial connection and data reading
def serial_thread_func():
    global serial_port
    print("Serial Telemetry Thread Started.")
    
    while not stop_thread.is_set():
        if not state['connected']:
            # Search for the DJI VCOM port
            port_found = None
            try:
                for port in serial.tools.list_ports.comports():
                    if any(dji_port in port.description for dji_port in DJI_PORT_DESCRIPTIONS):
                        port_found = port
                        break
            except Exception as e:
                pass

            if port_found:
                try:
                    port_name = port_found.name or port_found.device
                    serial_port = serial.Serial(port=port_name, timeout=0.1)
                    state['connected'] = True
                    state['port_name'] = port_found.description
                    print(f"\u001b[32;1mConnected to controller on port: {port_found.description}\u001b[0m")
                except Exception as e:
                    print(f"Failed to open port {port_found.device}: {e}")
                    state['connected'] = False
                    time.sleep(2.0)
                    continue
            else:
                # No controller found, wait and scan again
                state['connected'] = False
                state['port_name'] = 'None'
                time.sleep(1.5)
                continue

        # Controller is connected: send polling command and parse incoming packets
        try:
            # Ask the controller for status
            serial_port.write(bytearray.fromhex('55 0d 04 33 0a 06 eb 34 40 06 01 74 24'))
            
            # Read 1 byte waiting for header
            b = serial_port.read(1)
            if not b:
                continue
            
            if b == b'\x55':
                # Packet sync byte found! Read packet length (next 2 bytes)
                ph = serial_port.read(2)
                if len(ph) < 2:
                    continue
                
                ph_val = struct.unpack('<H', ph)[0]
                pl = 0b0000001111111111 & ph_val # Packet length resides in first 10 bits

                # Read remaining bytes
                pd = serial_port.read(pl - 3)
                if len(pd) < (pl - 3):
                    continue
                
                packet = b'\x55' + ph + pd
                
                # Check if it's standard 38-byte telemetry report
                if len(packet) == 38:
                    rx, raw_rx = parse_input(packet[13:15])
                    ry, raw_ry = parse_input(packet[16:18])
                    ly, raw_ly = parse_input(packet[19:21])
                    lx, raw_lx = parse_input(packet[22:24])
                    camera, raw_camera = parse_input(packet[25:27])

                    # Update thread-safe state dictionary
                    state['rx'] = rx
                    state['ry'] = ry
                    state['ly'] = ly
                    state['lx'] = lx
                    state['camera'] = camera

                    state['raw_rx'] = raw_rx
                    state['raw_ry'] = raw_ry
                    state['raw_ly'] = raw_ly
                    state['raw_lx'] = raw_lx
                    state['raw_camera'] = raw_camera

                    state['packets_received'] += 1
                    
        except Exception as e:
            print(f"\u001b[31;1mSerial connection lost: {e}\u001b[0m")
            state['connected'] = False
            state['port_name'] = 'None'
            if serial_port:
                try:
                    serial_port.close()
                except:
                    pass
                serial_port = None
            time.sleep(1.0)

# HTTP Request Handler to serve web page and Server-Sent Events (SSE)
class DashboardHTTPHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress standard logging to prevent terminal clutter, except for warnings/errors
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        # 1. Handle live SSE stream of controller values
        if self.path == '/stream':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            try:
                while not stop_thread.is_set():
                    # Format packet structure for SSE client
                    data_payload = {
                        'rx': state['rx'], 'ry': state['ry'],
                        'lx': state['lx'], 'ly': state['ly'],
                        'camera': state['camera'],
                        'raw_rx': state['raw_rx'], 'raw_ry': state['raw_ry'],
                        'raw_lx': state['raw_lx'], 'raw_ly': state['raw_ly'],
                        'raw_camera': state['raw_camera'],
                        'connected': state['connected'],
                        'port_name': state['port_name'],
                        'packets_received': state['packets_received'],
                        'config': config
                    }
                    sse_message = f"data: {json.dumps(data_payload)}\n\n"
                    self.wfile.write(sse_message.encode('utf-8'))
                    self.wfile.flush()
                    time.sleep(0.02) # 50fps stream
            except Exception as e:
                # Connection closed by client
                pass
            return

        # 2. Handle static asset delivery
        file_map = {
            '/': ('index.html', 'text/html'),
            '/style.css': ('style.css', 'text/css'),
            '/app.js': ('app.js', 'application/javascript'),
            '/config': ('config.json', 'application/json')
        }

        request_path = self.path
        if request_path in file_map or request_path == '':
            file_name, content_type = file_map.get(request_path, ('index.html', 'text/html'))
            
            # Resolve physical path (handling PyInstaller bundle directory vs persistent config)
            if file_name == 'config.json':
                full_path = os.path.abspath(file_name)
            else:
                full_path = get_resource_path(file_name)
            
            if os.path.exists(full_path):
                try:
                    with open(full_path, 'rb') as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Length', len(content))
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(content)
                except Exception as e:
                    self.send_error(500, f"Error reading file: {e}")
            else:
                self.send_error(404, "File not found")
        else:
            self.send_error(404, "Page not found")

    def do_POST(self):
        # 3. Handle saving config updates
        if self.path == '/config':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                new_settings = json.loads(post_data.decode('utf-8'))
                
                # Update configurations
                for key in config:
                    if key in new_settings:
                        config[key] = new_settings[key]
                
                # Write to disk
                with open(CONFIG_FILE, 'w') as f:
                    json.dump(config, f, indent=4)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success', 'config': config}).encode('utf-8'))
                print("Configuration saved successfully.")
            except Exception as e:
                self.send_error(400, f"Invalid config data: {e}")

class ThreadedHTTPServer(ThreadingTCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    print("====================================================")
    print("    DJI RC-N1/RC-N1C SIMULATOR BRIDGE SERVICE       ")
    print("====================================================")
    
    # Start background threads
    t_gp = threading.Thread(target=gamepad_thread_func, daemon=True)
    t_gp.start()

    t_ser = threading.Thread(target=serial_thread_func, daemon=True)
    t_ser.start()

    # Configure server port
    PORT = 8080
    server = ThreadedHTTPServer(('0.0.0.0', PORT), DashboardHTTPHandler)
    
    print(f"\u001b[36;1mVisualizer Dashboard running at http://localhost:{PORT}\u001b[0m")
    print("Connect your controller to the bottom USB-C port and power it on.")
    print("Press Ctrl+C to terminate this script.")
    print("----------------------------------------------------")

    try:
        try:
            import webbrowser
            def open_browser():
                time.sleep(0.5)
                webbrowser.open('http://localhost:8080')
            threading.Thread(target=open_browser, daemon=True).start()
        except Exception as e:
            pass

        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping DJI Bridge service...")
    finally:
        stop_thread.set()
        server.shutdown()
        if serial_port:
            try:
                serial_port.close()
            except:
                pass
        print("DJI Bridge service stopped successfully. Happy flying!")
