FROM public.ecr.aws/lambda/python:3.10

COPY requirements.txt ${LAMBDA_TASK_ROOT}/

RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY resume_parser.py ${LAMBDA_TASK_ROOT}/
COPY lambda_handler.py ${LAMBDA_TASK_ROOT}/

CMD ["lambda_handler.lambda_handler"]
