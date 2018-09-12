#!/bin/bash
echo "select pg_terminate_backend(pid) from pg_stat_activity where usename='$1'" | psql


