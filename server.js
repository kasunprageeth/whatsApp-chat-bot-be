require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { MessagingResponse } = require("twilio").twiml;

const supabase = require("./supabase");

const app = express();
app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post("/whatsapp", async (req, res) => {

    try {

        const originalMessage = req.body.Body;

        const incomingMessage = originalMessage.toLowerCase();

        //console.log("Incoming:", incomingMessage);

       // const userId = req.query.user_id;

        const { data: replies, error } = await supabase
            .from("auto_replies")
            .select("*")
            //.eq("user_id", userId);

        if (error) {
            console.log("Supabase Error:", error);
        }

        let reply = "Sorry, I didn't understand.";

        for (const item of replies) {

            const trigger = item.trigger_word.toLowerCase();

            if (incomingMessage.includes(trigger)) {

                reply = item.reply_message;

                console.log("Matched:", reply);

                break;
            }
        }

        // SAVE MESSAGE HISTORY
        await supabase
            .from("messages")
            .insert([
                {
                    customer_number: req.body.From,
                    incoming_message: originalMessage,
                    bot_reply: reply
                }
            ]);

        const twiml = new MessagingResponse();

        twiml.message(reply);

        res.writeHead(200, { "Content-Type": "text/xml" });

        res.end(twiml.toString());

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.get("/replies", async (req, res) => {

    try {

        //const userId = req.query.user_id;

const { data, error } = await supabase
    .from("auto_replies")
    .select("*")
    //.eq("user_id", userId);

        if (error) {
            return res.status(500).json(error);
        }

        res.json(data);

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.post("/replies", async (req, res) => {

    try {

        const {
            trigger_word,
            reply_message,
           // user_id
        } = req.body;

        const { data, error } = await supabase
            .from("auto_replies")
            .insert([
                {
                    trigger_word,
                    reply_message,
                   // user_id
                }
            ]);

        if (error) {
            return res.status(500).json(error);
        }

        res.json(data);

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.delete("/replies/:id", async (req, res) => {

    try {

        const id = req.params.id;

        const { error } = await supabase
            .from("auto_replies")
            .delete()
            .eq("id", id);

        if (error) {
            return res.status(500).json(error);
        }

        res.json({
            success: true
        });

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.put("/replies/:id", async (req, res) => {

    try {

        const id = req.params.id;

        const { trigger_word, reply_message } = req.body;

        const { data, error } = await supabase
            .from("auto_replies")
            .update({
                trigger_word,
                reply_message
            })
            .eq("id", id);

        if (error) {
            return res.status(500).json(error);
        }

        res.json(data);

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.get("/messages", async (req, res) => {

    try {

        const { data, error } = await supabase
            .from("messages")
            .select("*")
            .order("created_at", {
                ascending: false
            });

        if (error) {
            return res.status(500).json(error);
        }

        res.json(data);

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});