FROM public.ecr.aws/lambda/nodejs:20

RUN dnf upgrade -y && \
    dnf install -y openssl && \
    dnf clean all 