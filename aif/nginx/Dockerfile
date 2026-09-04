FROM ubuntu:22.04
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get -y install nginx
RUN apt-get -y install python3-pip python-is-python3
RUN pip install -U certbot certbot-nginx

COPY default /etc/nginx/sites-available
COPY etc.letsencrypt.tar.gz /etc/

RUN cd /etc ; tar -xvzf etc.letsencrypt.tar.gz

CMD ["nginx", "-g", "daemon off;"]
