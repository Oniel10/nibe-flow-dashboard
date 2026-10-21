FROM python:3.13-alpine3.22
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./
EXPOSE 8099
CMD ["python", "server.py"]
