from pathlib import Path

from flask import Flask
from flask_socketio import SocketIO

from app.core.config import AppConfig
from app.models.orm import db


BASE_DIR = Path(__file__).resolve().parent

socketio = SocketIO()


def create_app():
    flask_app = Flask(
        __name__,
        template_folder=str(BASE_DIR / "templates"),
        static_folder=str(BASE_DIR / "static"),
        static_url_path="/static",
    )

    flask_app.config["SECRET_KEY"] = AppConfig.SECRET_KEY
    flask_app.config["SQLALCHEMY_DATABASE_URI"] = AppConfig.SQLALCHEMY_DATABASE_URI
    flask_app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(flask_app)

    socketio.init_app(
        flask_app,
        cors_allowed_origins="*",
        async_mode="threading",
    )

    from app.api.routes import main_bp
    flask_app.register_blueprint(main_bp)

    with flask_app.app_context():
        db.create_all()
        print("Database tables created successfully.")

    return flask_app
