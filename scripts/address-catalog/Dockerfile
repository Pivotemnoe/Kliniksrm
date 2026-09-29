FROM python:3.13-alpine
RUN apk add --no-cache curl ca-certificates
COPY certs/russian_trusted_root_ca.pem /usr/local/share/ca-certificates/russian_trusted_root_ca.crt
RUN update-ca-certificates
COPY scripts/address-catalog/download_gar.py scripts/address-catalog/build_gar.py /opt/address-catalog/
WORKDIR /opt/address-catalog
CMD ["sh", "-c", "python download_gar.py --output /data/raw && python build_gar.py --input /data/raw --output /data/ready"]
