.PHONY: help up down reset ps logs airflow-logs db-logs psql-elt psql-meta

help:
	@printf "%s\n" \
	  "Targets:" \
	  "  up           Start Airflow + Postgres + Redis" \
	  "  down         Stop containers (keep volumes)" \
	  "  reset        Stop containers and delete volumes (DATA LOSS)" \
	  "  ps           Show container status" \
	  "  logs         Tail all logs" \
	  "  airflow-logs  Tail Airflow worker logs" \
	  "  db-logs      Tail Postgres logs" \
	  "  psql-elt     Open psql into elt_db as elt_user" \
	  "  psql-meta    Open psql into airflow_meta as airflow"

up:
	docker compose up -d

down:
	docker compose down

reset:
	docker compose down -v

ps:
	docker compose ps -a

logs:
	docker compose logs -f --tail 200

airflow-logs:
	docker compose logs -f --tail 200 airflow-worker

db-logs:
	docker compose logs -f --tail 200 postgres

psql-elt:
	docker exec -it postgres psql -U elt_user -d elt_db

psql-meta:
	docker exec -it postgres psql -U airflow -d airflow_meta

