FROM postgres:13

# Bake init script into the image so it can be executed reliably (bind-mounted scripts
# from some macOS/External volume mounts can fail with "bad interpreter: Permission denied").
COPY init-multiple-databases.sh /docker-entrypoint-initdb.d/init-multiple-databases.sh
RUN chmod 0755 /docker-entrypoint-initdb.d/init-multiple-databases.sh

