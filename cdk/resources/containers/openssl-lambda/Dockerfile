FROM public.ecr.aws/lambda/nodejs:20

COPY ./* ${LAMBDA_TASK_ROOT}

# Required for openssl to work
ENV LD_LIBRARY_PATH=""

RUN dnf upgrade -y && \
    dnf install -y openssl && \
    dnf clean all 
