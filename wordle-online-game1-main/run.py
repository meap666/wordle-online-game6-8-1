#import eventlet
#eventlet.monkey_patch()

from app import create_app, socketio

# 建立 Flask app
app = create_app()

# 載入 SocketIO 事件
# 這行很重要，Render 用 gunicorn run:app 時也會執行到這裡
from app.sockets import events  # noqa: F401


# 本機測試時才會執行這裡
if __name__ == "__main__":
    socketio.run(
        app,
        host="0.0.0.0",
        port=5000,
        debug=True,
        allow_unsafe_werkzeug=True
    )
