require("dotenv").config();

const schedule = require("./schedule.json");
const fs = require("fs");
const config = require("./config.json");
const { DateTime } = require("luxon");

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

//bot intent
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

//timezone abbrv
const timezones = {
    EST: "America/New_York",
    EDT: "America/New_York",

    CST: "America/Chicago",
    CDT: "America/Chicago",

    MST: "America/Denver",
    MDT: "America/Denver",

    PST: "America/Los_Angeles",
    PDT: "America/Los_Angeles"
};

//add allowed fields
const allowedFields = [
    "event",
    "start",
    "end",
    "opponent",
    "notes"
];

//find current week
function getWeekRange() {
    const today = DateTime.now()
        .setZone(schedule.timezone);

    const monday = today.startOf("week").set({ weekday: 1 });

    const sunday = monday.plus({
        days: 6
    });

    return `${monday.toFormat("MMMM d")} - ${sunday.toFormat("MMMM d, yyyy")}`;
}

//timezone to team time conversion (PST)
function convertToTeamTime(time, timezone) {

    const normalizedTime = time
        .toUpperCase()
        .replace(/\s/g, "");


    let userTime;


    if (normalizedTime.includes(":")) {

        userTime = DateTime.fromFormat(
            normalizedTime,
            "h:mma",
            {
                zone: timezone
            }
        );

    }
    else {

        userTime = DateTime.fromFormat(
            normalizedTime,
            "ha",
            {
                zone: timezone
            }
        );

    }


    if (!userTime.isValid) {
        console.log(userTime.invalidReason);
        return null;
    }


    const teamTime = userTime.setZone(
        schedule.timezone
    );


    return teamTime.toFormat("HH:mm");
}

//format day
function formatDay(day) {
    return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
}

//timestamp func
function createDiscordTimestamp(day, time) {

    const days = {
        Monday: 0,
        Tuesday: 1,
        Wednesday: 2,
        Thursday: 3,
        Friday: 4,
        Saturday: 5,
        Sunday: 6
    };

    const date = DateTime.now()
        .setZone(schedule.timezone)
        .startOf("week")
        .plus({
            days: days[day]
        });

    const [hour, minute] = time.split(":");

    const eventTime = date.set({
        hour: Number(hour),
        minute: Number(minute)
    });

    return Math.floor(eventTime.toSeconds());
}

//let bot change schedule file to update
function saveSchedule() {
    fs.writeFileSync(
        "./schedule.json",
        JSON.stringify(schedule, null, 4)
    );
}

//delete error messages
function deleteMessagesAfter(message, reply, time) {
    setTimeout(() => {
        message.delete().catch(() => { });

        if (reply) {
            reply.delete().catch(() => { });
        }
    }, time);
}

function createScheduleEmbed(user) {

    const embed = new EmbedBuilder()
        .setTitle("📅 CS2 Weekly Schedule")
        .setDescription(
            `**Week of ${getWeekRange()}**`)
        .setTimestamp()
        .setFooter({
            text: `Updated by ${user.displayName}`
        })
        .setColor(0x00FF00);

    for (const day in schedule.weekDays) {

        const event = schedule.weekDays[day];

        //skip empty days
        if (event.event === null) {
            continue;
        }

        let emoji = "";

        if (event.event === "Match") {
            emoji = "🏆";
        }
        else if (event.event === "Practice") {
            emoji = "🎮";
        }
        else {
            emoji = "📌";
        }

        let fieldText = `${emoji} **${event.event}**\n\n`;

        if (event.start !== null) {

            const startTimestamp = createDiscordTimestamp(
                day,
                event.start
            );

            if (event.end !== null) {

                const endTimestamp = createDiscordTimestamp(
                    day,
                    event.end
                );

                fieldText += `⏰ **Time:** <t:${startTimestamp}:t> - <t:${endTimestamp}:t>\n`;
            }
            else {
                fieldText += `⏰ **Time:** <t:${startTimestamp}:t>\n`;
            }
        }

        if (event.opponent) {
            fieldText += `Against: ${event.opponent}\n`;
        }

        if (event.goals && event.goals.length > 0) {

            fieldText += `Goals:\n`;

            event.goals.forEach(goal => {
                fieldText += `• ${goal}\n`;
            });
        }

        if (event.notes) {

            fieldText += `Notes:\n`;

            fieldText += `• ${event.notes}\n`;
        }

        embed.addFields({
            name: `━━━━━━━━ ${day} ━━━━━━━━`,
            value: fieldText
        });
    }

    return embed;
}

//update schedule
async function updateScheduleMessage(channel, user) {

    const scheduleEmbed = createScheduleEmbed(user);


    if (config.scheduleMessageID !== null) {

        try {

            const oldMessage = await channel.messages.fetch(
                config.scheduleMessageID
            );

            await oldMessage.edit({
                embeds: [scheduleEmbed]
            });

            console.log("Schedule updated");

        }

        catch (error) {

            console.log("Old schedule not found. Creating new one.");

            const newMessage = await channel.send({
                embeds: [scheduleEmbed]
            });

            config.scheduleMessageID = newMessage.id;

            fs.writeFileSync(
                "./config.json",
                JSON.stringify(config, null, 4)
            );
        }

    }

    else {

        const newMessage = await channel.send({
            embeds: [scheduleEmbed]
        });


        config.scheduleMessageID = newMessage.id;


        fs.writeFileSync(
            "./config.json",
            JSON.stringify(config, null, 4)
        );

    }
}

//connect succeful message
client.once("clientReady", () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

//bot send schedule function
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.content === "!schedule") {
        await updateScheduleMessage(
            message.channel,
            message.author
        );
    }

    else if (message.content === "!help") {

        const helpMessage =
            `📅 **CS2 Schedule Bot Help**

            **Update Format:**
            \`!update <day> field value, field value\`

            **Accepted Fields:**
            • event
            • start
            • end
            • opponent
            • notes

            **Examples:**

            \`!update sunday event Match, start 5pm PST, opponent Team Liquid\`

            \`!update tuesday event Practice, start 6pm PST, end 8pm PST\`

            \`!update friday event null\`
            `;

        const help = await message.reply(helpMessage);

        setTimeout(() => {
            help.delete().catch(() => { });
            message.delete().catch(() => { });
        }, 300000);
    }

    else if (message.content.startsWith("!update")) {

        // remove !update from command
        const command = message.content
            .replace("!update", "")
            .trim();


        // get day
        const parts = command.split(" ");

        const day = formatDay(parts[0]);


        if (!schedule.weekDays[day]) {

            const errorMessage = await message.reply(
                "Invalid day."
            );

            deleteMessagesAfter(
                message,
                errorMessage,
                10000
            );

            return;
        }


        // remove day from command
        const updatesText = command
            .substring(parts[0].length)
            .trim();


        // split updates by comma
        const updates = updatesText.split(",");


        for (let update of updates) {

            update = update.trim();


            const updateParts = update.split(" ");


            const field = updateParts[0];

            let value = updateParts
                .slice(1)
                .join(" ");


            // check field exists
            if (!allowedFields.includes(field)) {

                const errorMessage = await message.reply(
                    `Invalid field: ${field}`
                );

                deleteMessagesAfter(
                    message,
                    errorMessage,
                    10000
                );

                return;
            }


            // make sure value exists
            if (!value) {

                const errorMessage = await message.reply(
                    `Missing value for ${field}.`
                );

                deleteMessagesAfter(
                    message,
                    errorMessage,
                    10000
                );

                return;
            }


            // event formatting
            if (field === "event") {

                if (value.toLowerCase() === "null") {

                    value = null;

                }
                else {

                    value =
                        value.charAt(0).toUpperCase() +
                        value.slice(1).toLowerCase();

                }
            }


            // convert times to team timezone
            if (field === "start" || field === "end") {


                let timezone = schedule.timezone;


                const timeParts = value.split(" ");


                // check for timezone abbreviation
                if (timeParts.length > 1) {

                    const possibleTZ =
                        timeParts[timeParts.length - 1]
                            .toUpperCase();


                    if (timezones[possibleTZ]) {

                        timezone = timezones[possibleTZ];

                        timeParts.pop();

                    }
                }


                value = convertToTeamTime(
                    timeParts.join(" "),
                    timezone
                );


                if (value === null) {

                    const errorMessage = await message.reply(
                        "Invalid time format."
                    );

                    deleteMessagesAfter(
                        message,
                        errorMessage,
                        10000
                    );

                    return;
                }
            }


            // update schedule
            schedule.weekDays[day][field] = value;
        }


        saveSchedule();


        await updateScheduleMessage(
            message.channel,
            message.author
        );


        // delete command
        deleteMessagesAfter(
            message,
            null,
            3000
        );
    }
});

client.login(process.env.TOKEN);