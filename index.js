require("dotenv").config();

//include json files
const schedule = require("./schedule.json");
const defaultSchedule = require("./defaultSchedule.json");
const config = require("./config.json");

//imported libraries
const fs = require("fs");
const { DateTime } = require("luxon");
const cron = require("node-cron");



const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require("discord.js");

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

//grab the current day from args
function getDayFromArgs(args) {

    const days = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday"
    ];

    const possibleDay = args[0]?.toLowerCase();

    if (days.includes(possibleDay)) {
        return {
            day: possibleDay.charAt(0).toUpperCase() + possibleDay.slice(1),
            startIndex: 1
        };
    }

    return {
        day: DateTime.now()
            .setZone(schedule.timezone)
            .toFormat("cccc"),
        startIndex: 0
    };
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

    if (!day) {
        return null;
    }

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

//reset weekly schedule to default
function resetSchedule() {

    schedule.weekDays = structuredClone(
        defaultSchedule.weekDays
    );

    schedule.lastResetWeek = DateTime.now()
        .setZone(schedule.timezone)
        .toFormat("kkkk-WW");

    saveSchedule();

    console.log("Weekly schedule reset to default template.");
}

//check for new week
function checkForNewWeek() {

    const currentWeek = DateTime.now()
        .setZone(schedule.timezone)
        .toFormat("kkkk-WW");

    if (schedule.lastResetWeek !== currentWeek) {
        resetSchedule();

        return true;
    }

    return false;
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

function createScheduleMessage(user) {

    const embed = new EmbedBuilder()
        .setTitle("📅 CS2 Weekly Schedule")
        .setDescription(
            `**Week of ${getWeekRange()}**`
        )
        .setTimestamp()
        .setFooter({
            text: `Updated by ${user.displayName ?? user.username}`
        })
        .setColor(0x00FF00);


    for (const day in schedule.weekDays) {

        const event = schedule.weekDays[day];

        // skip empty days
        if (event.event === null) {
            continue;
        }


        let emoji = "📌";

        if (event.event === "Match") {
            emoji = "🏆";
        }
        else if (event.event === "Practice") {
            emoji = "🎮";
        }


        let fieldText = `${emoji} **${event.event}**\n\n`;


        // time
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

                fieldText +=
                    `⏰ **Time:** <t:${startTimestamp}:t> - <t:${endTimestamp}:t>\n`;

            }
            else {

                fieldText +=
                    `⏰ **Time:** <t:${startTimestamp}:t>\n`;

            }
        }


        // opponent
        if (event.opponent) {

            fieldText +=
                `🥊 **Opponent:** ${event.opponent}\n`;

        }


        // goals
        if (event.goals && event.goals.length > 0) {

            fieldText += `\n**Goals:**\n`;

            event.goals.forEach(goal => {

                fieldText += `• ${goal}\n`;

            });
        }

        // notes
        if (event.notes) {

            fieldText +=
                `\n📝 **Notes:**\n`;

            fieldText +=
                `• ${event.notes}\n`;

        }


        embed.addFields({
            name: `━━━━━━━━ ${day} ━━━━━━━━`,
            value: fieldText
        });
    }


    return {
        embeds: [embed]
    };
}

//update schedule
async function updateScheduleMessage(channel, user) {

    config.scheduleChannelID = channel.id;

    const scheduleMessage = createScheduleMessage(user);


    if (config.scheduleMessageID !== null) {

        try {

            const oldMessage = await channel.messages.fetch(
                config.scheduleMessageID
            );

            await oldMessage.edit(scheduleMessage);

            console.log("Schedule updated");

        }

        catch (error) {

            console.log("Old schedule not found. Creating new one.");

            const newMessage = await channel.send(scheduleMessage);

            config.scheduleMessageID = newMessage.id;

            fs.writeFileSync(
                "./config.json",
                JSON.stringify(config, null, 4)
            );
        }

    }

    else {

        const newMessage = await channel.send(scheduleMessage);

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

    //check for new week
    cron.schedule(
        "0 0 * * *",
        () => {

            console.log("Checking for new week...");

            if (checkForNewWeek()) {
                console.log("Schedule automatically reset to default.");

                if(!config.scheduleChannelID){
                    console.log("No schedule channel configured yet.");
                    return;
                }
            }

        }, {
        timezone: schedule.timezone
    }
    );
});

//bot message event handler
client.on("messageCreate", async (message) => {

    if (message.author.bot) return;

    if (
        message.content === "!schedule" ||
        message.content.startsWith("!update") ||
        message.content.startsWith("!goals")) {
        checkForNewWeek();
    }

    if (message.content === "!schedule") {
        await updateScheduleMessage(
            message.channel,
            message.author
        );

        deleteMessagesAfter(
            message,
            null,
            3000
        );
    }

    else if (message.content === "!help") {

        const helpMessage =
            `📅 **CS2 Schedule Bot Help**

            **Update Schedule:**
            \`!update [day] field value, field value\`

            The day is optional. If no day is provided, the current day will be updated.

            **Accepted Fields:**
            • \`event\` - Match, Practice, or null
            • \`start\` - Start time
            • \`end\` - End time
            • \`opponent\` - Opposing team
            • \`notes\` - Additional information

            **Examples:**

            Updating today's schedule:
            \`!update event Match, start 5pm PST, opponent Team Liquid\`

            Updating a specific day:
            \`!update sunday event Match, start 5pm PST, opponent Team Liquid\`

            Multiple fields:
            \`!update tuesday event Practice, start 6pm PST, end 8pm PST\`

            Clearing an event:
            \`!update friday event null\`


            **Goals:**
            \`!goals [day] goal, goal\`

            Adds one or more goals to the current day or a specified day.

            **Examples:**

            Adding goals for today:
            \`!goals Review demos, practice utility\`

            Adding goals to a specific day:
            \`!goals Wednesday Review executes, improve communication\`

            Clearing goals:
            \`!goals Monday null\`
            `;

        const help = await message.reply(helpMessage);

        setTimeout(() => {
            help.delete().catch(() => { });
            message.delete().catch(() => { });
        }, 20000);
    }

    else if (message.content.startsWith("!update")) {

        // remove !update from command
        const command = message.content
            .replace("!update", "")
            .trim();

        const parts = command.split(" ");

        let day;
        let updatesText;

        //check if first arg is a day
        const possibleDay = formatDay(parts[0]);

        if (schedule.weekDays[possibleDay]) {

            //if day was provided
            day = possibleDay;

            updatesText = command
                .substring(parts[0].length)
                .trim();
        }
        else {

            //no day provided
            day = DateTime.now()
                .setZone(schedule.timezone)
                .toFormat("cccc");

            updatesText = command;
        }


        // split updates by comma
        const updates = updatesText.split(",");


        for (let update of updates) {

            update = update.trim();


            const updateParts = update.split(" ");


            const field = updateParts[0].toLowerCase();

            let value = updateParts
                .slice(1)
                .join(" ");


            // check field exists
            if (!allowedFields.includes(field)) {

                let errorText = `Invalid field: ${field}.`;

                if (field === "goals") {
                    errorText += " Did you mean to use !goals?";
                }

                const errorMessage = await message.reply(errorText);

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


            //if value is null, set to null
            if (value.toLowerCase() === "null"){

                value = null;
            }

            //if value isnt null
            if (field === "event" && value !== null){
                 value = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
            }



            // convert times to team timezone
            if ((field === "start" || field === "end") && value !== null) {


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

    else if (message.content.startsWith("!goals")) {

        //remove !goals from command
        const command = message.content
            .replace("!goals", "")
            .trim();

        //split command
        const parts = command.split(" ");

        let day;
        let goalsText;

        //check if first word is a day
        const possibleDay = formatDay(parts[0]);

        //if true
        if (schedule.weekDays[possibleDay]) {
            day = possibleDay;

            goalsText = command.substring(parts[0].length).trim();
        }
        else {
            day = DateTime.now()
                .setZone(schedule.timezone)
                .toFormat("cccc");

            goalsText = command;
        }

        if (!goalsText) {
            const errorMessage = await message.reply("Provide at least one goal to add.");

            deleteMessagesAfter(
                message,
                errorMessage,
                10000
            );

            return;
        }

        if (goalsText.toLowerCase() === "null") {
            schedule.weekDays[day].goals = [];

            saveSchedule();

            await updateScheduleMessage(
                message.channel,
                message.author
            );

            deleteMessagesAfter(
                message,
                null,
                3000
            );

            return;
        }

        const goals = goalsText.split(",");

        for (let goal of goals) {
            goal = goal.trim();

            if (!goal) {
                continue;
            }

            schedule.weekDays[day].goals.push(goal);
        }

        saveSchedule();

        await updateScheduleMessage(
            message.channel,
            message.author
        );

        deleteMessagesAfter(
            message,
            null,
            3000
        );

    }
});

client.login(process.env.TOKEN);