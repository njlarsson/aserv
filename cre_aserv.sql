-- To create aserv user with password "secret": password for the aserv user with:
--
--    \set apass '\'secret\''
--    \i cre_aserv.sql

create user aserv with createdb createrole encrypted password :apass;
create database aserv with owner=aserv;
revoke all privileges on database aserv from public;
\c aserv

create table mahuser (
       mahid text primary key,
       email text,
       inited bool
);

alter table mahuser owner to aserv;
