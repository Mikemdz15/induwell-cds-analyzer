import http.server
import webbrowser
import threading
import sys
import os

PORT = 8080
Handler = http.server.SimpleHTTPRequestHandler

# Cambiar al directorio de este archivo
os.chdir(os.path.dirname(os.path.abspath(__file__)))

def start_server(port):
    while True:
        try:
            # Usar HTTPServer estándar
            httpd = http.server.HTTPServer(("", port), Handler)
            print(f"\n========================================================")
            print(f" Servidor de Planeacion S&OP Induwell Iniciado")
            print(f" URL local: http://localhost:{port}")
            print(f" Presiona CTRL+C para detener el servidor")
            print(f"========================================================\n")
            sys.stdout.flush()
            
            def open_browser():
                webbrowser.open(f"http://localhost:{port}")
            
            threading.Timer(1.0, open_browser).start()
            
            httpd.serve_forever()
        except OSError as e:
            print(f"Puerto {port} ocupado, probando puerto {port + 1}...")
            sys.stdout.flush()
            port += 1

if __name__ == "__main__":
    try:
        start_server(PORT)
    except KeyboardInterrupt:
        print("\nServidor detenido por el usuario.")
        sys.exit(0)
