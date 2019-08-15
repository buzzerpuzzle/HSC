const express = require('express');
const http = require('http');                                                                                                            
const path = require('path');                                                                                                            
const cors = require('cors'); 
const https = require('https');
const fs = require('fs');
const app = express();
const lineReader = require('line-reader');

const accountSid = 'xxxx';
const authToken = 'xxxx';
const client = require('twilio')(accountSid, authToken);

const options = {
    key: fs.readFileSync("xxxx"),
    cert: fs.readFileSync("xxxx")
};

var schedule = require('node-schedule');
var mysql = require('mysql');

// Use key(time) -> value(number, messages, auto_response, media)
var timemap = new Map();
// Use key(contact) -> value(Counter(Forward times), Counter(Remaining minute))
var deck = new Map();
// Recent 24 hours response.
var recentResponse = [];

var currentTime = 1;

var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'xxxx',
        pass: 'xxxx'
    }
});

const bodyParser = require('body-parser')
// Tell express to use the body-parser middleware and to not parse extended bodies
app.use(bodyParser.urlencoded({ extended: false }))

app.use(cors());

const port = process.env.PORT || 80;

app.use(express.static(__dirname + '/../client'));

function scheduleCronstyle(){
    // Check for the below schdule every minute.
    schedule.scheduleJob('30 * * * * *', function(){
        try{
            // Read the json file to load the job for specific number.
            var objs = JSON.parse(fs.readFileSync('phone_list.json', 'utf8'));  
            for(var i=0; i<objs.length; ++i){
                var obj = objs[i];

                var buffer = [];
                buffer.push(obj.phone_number);
                buffer.push(obj.message);
                buffer.push(obj.auto_response);
                buffer.push(obj.media_url);

                // Insert the information of the contact and messages to specific time key.
                if(timemap.get(obj.date) != undefined){
                    console.log("Push back");
                    timemap.get(obj.date).push(buffer);
                    console.log(obj.date);
                    console.log(timemap.get(obj.date));
                }
                else{
                    console.log("create");
                    timemap.set(obj.date, []);
                    timemap.get(obj.date).push(buffer);
                    console.log(obj.date);
                    console.log(timemap.get(obj.date));
                }
            }
            // Remove the json file.
            fs.unlinkSync('phone_list.json');
        }
        catch(e){
            console.log("There is no input file");

            // Get the current time key
            // For example, 11:00 means 11
            // 		15:00 means 15
            key = calcKey('-7');
            console.log("Current time key " + key);

            // Check if there is any candidate need to be sent message. 
            if(timemap.get(key)!=undefined){
                console.log("There is corresponding value for the key");
                var list = timemap.get(key);
                if(list.length != 0){
                    console.log("Get the list of the elements from the key");
                    for(var i=0; i<list.length; ++i){
                        var number = list[i][0];
                        var message = list[i][1];
                        var reminder = list[i][2];
                        var media = list[i][3];
                        sendMessages(number, message, reminder, media);
                        console.log("Send the message");
                    }
                }
                timemap.set(key, []);
            } 
            else{
                console.log("There is no correspnding value for the key");
            }

            // Check all the numbers inside the deck
            // whether it meets 5 times or above of forwarding.
            for (var entry of deck.entries()) {
                console.log("Schedule");
                console.log(deck);
                // Get the time key.
                var key = entry[0];
                // Reset the value of its remaining minute less one minute.
                var times_forward = deck.get(key)[0];
                var times_remain = deck.get(key)[1];
                var times_reminder = deck.get(key)[2];

                deck.set(key, [times_forward, times_remain-1, times_reminder]);
                console.log(deck);	

                // Set the reminder for the remaining time
                if(deck.get(key)[1] == 1440 && deck.get(key)[2] == true){
                    sendMessages(key, "Please help to forward the SMS to five of your peers. Thanks!", false, null);
                }
                else if(deck.get(key)[1] == 0){
                    if(deck.get(key)[2] == true){
                        sendMessages(key, "Thanks for your help to forward the SMS to your peers!", false, null);
                    }
                    deck.delete(key);
                }

                // Forward more than 5 peers.
                if(deck.get(key)[0] >= 5){
                    sendMessages(key, "Thanks for your help to forward the SMS to your peers!", false, null);
                    deck.delete(key);
                }
            }
        }

        if(currentTime%1440 == 0){
            if(recentResponse.length > 0){
                var mailOptions = {
                    from: 'xxxx',
                    to: ['xxxx', 'xxxx'],
                    subject: 'Response get of last 24 hours before ' + calcKey('-7'),
                    text: recentResponse,
                };

                transporter.sendMail(mailOptions, function(error, info){
                    if (error) {
                        console.log(error);
                    } else {
                        console.log('Email sent: ' + info.response);
                    }
                });

                recentResponse = [];
            }

            currentTime = 1;
        }
        else{
            currentTime++;
        }

    }); 
}

//Send the messages by twilio api.
function sendMessages(number, message, reminder, media){
    // Set the counter(Forward times, Remaining Minutes) for specifc contact
    if(deck.get(number)==undefined){
        deck.set(number, [0, 2880, reminder]);
        console.log(deck);
    }
    if(media == null){
        client.messages
            .create({
                body: message,
                from: 'xxxx',
                to: number
            })
            .then(message => console.log(message.sid));	
    }
    else{
        client.messages                                                                                                                      
            .create({                                                                                                                        
                body: message,                                                                                                               
                from: 'xxxx',                                                                                                         
                mediaUrl: [media],                                                      
                to: number                                                                                                                   
            })                                                                                                                               
            .then(message => console.log(message.sid)); 
    }
}

//Get the time key.
function calcKey(offset) {
    d = new Date();
    utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    nd = new Date(utc + (3600000*offset));

    year = nd.getFullYear();
    month = nd.getMonth()+1;
    date = nd.getDate();
    hour = nd.getHours();
    minute = nd.getMinutes();

    if(month < 10){
        month = "0" + month;
    }
    if(date < 10){
        date = "0" + date;
    }

    if(hour < 10){
        hour = "0" + hour;
    }
    if(minute < 10){
        minute = "0" + minute;
    }

    res = year + "" + month + "" + date + "" + hour + "" + minute;

    return res;
}

// Get the local time(format) for storing data into mysql.
function calcTime(offset) {
    d = new Date();
    utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    nd = new Date(utc + (3600000*offset));

    year = nd.getFullYear();
    month = nd.getMonth()+1;
    date = nd.getDate();
    hour = nd.getHours();
    minute = nd.getMinutes();
    second = nd.getSeconds();
    if(month < 10){
        month = "0" + month;
    }
    if(date < 10){
        date = "0" + date;
    }

    if(hour < 10){
        hour = "0" + hour;
    }
    if(minute < 10){
        minute = "0" + minute;
    }
    if(second < 10){
        second = "0" + second;
    }
    res = year+"-"+month+"-"+date+" "+hour+":"+minute+":"+second;
    return res;
}

scheduleCronstyle();

app.post('/sms_service/receive/', function(req, res) {
    console.log("SMS Service " + JSON.stringify(req.body));
    // Log into the mysql
    var con = mysql.createConnection({
        host: "xxxx",
        user: "xxxx",
        password: "xxxx",
        database: "xxxx"
    });

    //+11231231234 -> 11231231234
    var contact_key = req.body.From;
    contact_key = contact_key.substring(1);
    console.log("Contact key: " + contact_key);
    // Send the thank message to forward the SMS to their peers.
    if(deck.has(contact_key)){
        console.log("Reminder: " + deck.get(contact_key)[2]);
        if(deck.get(contact_key)[2] == true){
            console.log("There is the Contact key with reminder: " + contact_key);
            console.log(deck);
            var times_forward = deck.get(contact_key)[0];
            var times_remain = deck.get(contact_key)[1];
            deck.set(contact_key, [times_forward+1, times_remain]);
            console.log(deck);
            sendMessages(contact_key, "Thanks for forward the messages to your friend!", "", null);
        }
        else {
            console.log("There is the Contact key without reminder: " + contact_key);		
        }
        recentResponse.push("From: " + req.body.From + " To: " + req.body.To + " Content: " + req.body.Body);
    }
    else{
        console.log("There is no " + contact_key);
    }

    // Store the receive data into mysql
    con.connect(function(err) {
        if (err) throw err;
        console.log("Connected to receiver!");

        date = calcTime('-7');
        var sql = "INSERT INTO receiver (body, to_num, tocity, tostate, tocountry, tozip, from_num, fromcity, fromstate, fromcountry, fromzip, time) VALUES ("
            + "'" + req.body.Body + "'" + ", " + "'" + req.body.To + "'" + ", " + "'" + req.body.ToCity + "'" + ", " + "'" + req.body.ToState + "'" 
            + ", " + "'" + req.body.ToCountry + "'" + ", " + "'" + req.body.ToZip + "'" + ", " + "'" + req.body.From + "'" + ", " + "'" + req.body.FromCity 
            + "'" + ", " + "'"  + req.body.FromState + "'" + ", " + "'" + req.body.FromCountry + "'" + ", " + "'" + req.body.FromZip + "'" + ", " 
            + "'" + date + "'" + ")";
        console.log(sql);

        con.query(sql, function (err, result) {
            if (err) throw err;
            console.log("1 record inserted");
        });

    });
});

const server = http.createServer(app);

server.listen(port, () => console.log('Running... on port 80'));
