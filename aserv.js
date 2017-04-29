// aserv.js
//
// Jesper Larsson, Malmö University, 2017

var pg = require('pg');
var http = require('http');
var url = require('url');
var nodemailer = require('nodemailer');

var aservPass = process.argv[2];
var gmailPass = process.argv[3];

// ---------------- email ----------------

var sendEmail = function(mahId, email, pass, resp) {
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'pgadm.mah@gmail.com',
            pass: gmailPass
        }
    });

    var mailOptions = {
        from: '"Mah Postgres Admin" <pgadm.mah@gmail.com>',
        to: email,
        subject: 'Postgres server update',
        text: "You should now be able to log in to postgres server."
            +"\nDatabase: "+mahId+"\nUser: "+mahId+"\nPassword: "+pass
    };

    transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            console.log("Error sending email to "+email+" ("+mahId+"): "+error);
            resp.end("There was a problem sending email to "+email);
        } else {
            resp.end("Check your email: "+email);
        }
    });
};

// ---------------- utilities ----------------

var dbConnect = function() {
    var dbClient = new pg.Client("postgres://aserv:"+aservPass+"@localhost:5432/aserv");
    dbClient.connect();
    return dbClient;
};

var sendNotFound = function(url, resp) {
    resp.statusCode = 404;
    resp.write("<!DOCTYPE html><meta charset='UTF-8'><title>Resource not found</title>");
    resp.write("Kan inte hitta "+url)
    resp.end();
};

var sendDbError = function(where, err, dbClient, resp) {
    console.log("DB error "+where+": "+JSON.stringify(err, null, 4));
    dbClient.end();
    resp.statusCode = 500;
    resp.write("<!DOCTYPE html><meta charset='UTF-8'><title>Database error</title>");
    resp.write("Error in database access")
    resp.end();
};

var batchSql = function(batchName, sql, off, dbClient, resp, finished) {
    var q = sql[off];
    if (q) {
        dbClient.query(q)
            .on('error', function(err) {
                sendDbError(batchName+" off="+off, err, dbClient, resp);
            })
            .on('end', function() {
                batchSql(batchName, sql, off+1, dbClient, resp, finished);
            });
    } else {
        finished();
    }
};

// ---------------- database updaters ----------------

var initUser = function(mahId, email, dbClient, resp) {
    console.log("init '"+mahId+"'");
    var pass = Math.random().toString(36).substring(2, 10);
    batchSql('create',
             ["create user "+mahId+" with createdb connection limit 10 encrypted password '"+pass+"'",
              "grant "+mahId+" to aserv",
              "create database "+mahId+" with owner="+mahId,
              "revoke all privileges on database "+mahId+" from public",
              "revoke "+mahId+" from aserv",
              "update mahuser set inited=true where mahid='"+mahId+"'"],
             0,
             dbClient,
             resp,
             function() {
                 console.log("created "+mahId);
                 dbClient.end();
                 sendEmail(mahId, email, pass, resp);
             });
};

// ---------------- service handlers ----------------

var sendBasePage = function(resp) {
    resp.write("<!DOCTYPE html><meta charset='UTF-8'><title>Postgres account control</title>");
    resp.write("<h1>Postgres account control</h1>")

    resp.write("<h2>Create your account</h2>")
    
    resp.write("<form action=initaccount method='GET'>\n");
    resp.write("Mah user ID: <input type='text' name='id'><br>\n");
    resp.write("<input type='submit' value='Create account'>\n");
    resp.write("</form>\n");
    
    resp.end();
};

var createAccount = function(mahId, resp) {
    var dbClient = dbConnect();

    var query = dbClient.query("select mahid, email, inited from mahuser where mahid=$1 or mahid=$2 or mahid=$3", [mahId, mahId.toLowerCase(), mahId.toUpperCase()]);
    var email, inited;
    query
        .on('row', function(row) {
            mahId = row.mahid;
            email = row.email;
            inited = row.inited;
        })
        .on('error', function(err) {
            sendDbError("select mahuser", err, dbClient, resp);
        })
        .on('end', function() {
            if      (!email) { dbClient.end(); resp.end("Unknown user '"+mahId+"'"); }
            else if (inited) { dbClient.end(); resp.end("Account already initialized for user '"+mahId+"'"); }
            else             { initUser(mahId, email, dbClient, resp); }
        });
};

// ---------------- the core request handler ----------------

var handleWebRequest = function(req, resp) {
    var parsed = url.parse(req.url, true);
    var param;

    if (req.url == "/" || req.url == "/index.html") {
        sendBasePage(resp);
    } else if (parsed.pathname == "/initaccount") {
        createAccount(parsed.query.id, resp);
    } else {
        sendNotFound(req.url, resp);
    }
};

// ---------------- get it started! ----------------

var httpConn = http.createServer(handleWebRequest);
var port = 8080;
httpConn.listen(port);
console.log('aserv PID ' + process.pid);
