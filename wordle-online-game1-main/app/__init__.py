from flask import Flask
# pyrefly: ignore [untyped-import]
from flask_socketio import SocketIO
from app.core.config import AppConfig
from app.models.orm import db

# 準備廣播通訊器
socketio = SocketIO()


def create_app():
    # 1. 建立 Flask 主程式
    flask_app = Flask(__name__)

    # 2. 套用系統設定
    flask_app.config["SECRET_KEY"] = AppConfig.SECRET_KEY
    flask_app.config["SQLALCHEMY_DATABASE_URI"] = AppConfig.SQLALCHEMY_DATABASE_URI
    flask_app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # 3. 初始化資料庫
    db.init_app(flask_app)

    # 4. 初始化 SocketIO
    socketio.init_app(
        flask_app,
        cors_allowed_origins="*",
        async_mode="threading"
    )  # type: ignore

    # 5. 註冊 Blueprint 路由
    from app.api.routes import main_bp
    flask_app.register_blueprint(main_bp)

    # 6. 建立資料庫資料表
    with flask_app.app_context():
        db.create_all()
        print("Database tables created successfully.")

    return flask_app
