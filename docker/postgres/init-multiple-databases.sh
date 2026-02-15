#!/bin/bash

set -e
set -u

function create_user_and_database() {
    local database=$1
    local username=$2
    local password=$3
    echo "Creating/updating user '$username' and database '$database'"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${username}') THEN
                CREATE ROLE "${username}" LOGIN PASSWORD '${password}';
            ELSE
                ALTER ROLE "${username}" WITH PASSWORD '${password}';
            END IF;
        END
        \$\$;

        -- CREATE DATABASE cannot run in a transaction, so we use psql's \gexec trick.
        SELECT format('CREATE DATABASE %I', '${database}')
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${database}');
        \gexec

        ALTER DATABASE "${database}" OWNER TO "${username}";
        GRANT ALL PRIVILEGES ON DATABASE "${database}" TO "${username}";
EOSQL
    echo "  User '$username' and database '$database' ensured successfully"
}

# Metadata database
create_user_and_database $METADATA_DATABASE_NAME $METADATA_DATABASE_USERNAME $METADATA_DATABASE_PASSWORD

# Celery result backend database
create_user_and_database $CELERY_BACKEND_NAME $CELERY_BACKEND_USERNAME $CELERY_BACKEND_PASSWORD

# ELT database
create_user_and_database $ELT_DATABASE_NAME $ELT_DATABASE_USERNAME $ELT_DATABASE_PASSWORD

echo "All databases and users created successfully"
