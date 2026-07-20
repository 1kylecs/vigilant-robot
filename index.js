require("dotenv").config();

//include json files
const schedule = require("./schedule.json");
const defaultSchedule = require("./defaultSchedule.json");
const config = require("./config.json");

//imported libraries
const fs = require("fs");
const { DateTime } = require("luxon");
const cron = require("node-cron");



const { Client,
        GatewayIntentBits,
        EmbedBuilder,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle 
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

    if(!day){
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

//check the week
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
            `**Week of ${getWeekRange()}**`)
        .setTimestamp()
        .setFooter({
            text: `Updated by ${user.displayName ?? user.username}`
        })
        .setColor(0x00FF00);

    const rows = [];

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

            const row = new ActionRowBuilder();

            event.goals.forEach((goal, index) => {
                const checkbox = goal.completed ? "✅" : "⬜";
                
                fieldText += `${checkbox} ${goal.text}\n`;

                rows.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`goal_${day}_${index}`)
                        .setLabel(`${checkbox} ${goal.text}`)
                        .setStyle(
                            goal.completed ? ButtonStyle.Success : ButtonStyle.Secondary
                        )
                );
            });

            rows.push(row);
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

    return {
        embeds: [embed],
        components: rows
    };
}

//update schedule
async function updateScheduleMessage(channel, user) {

    config.scheduleChannelID = channel.id;

    const scheduleEmbed = createScheduleMessage(user);
    const goalButtons = createGoalButtons();


    if (config.scheduleMessageID !== null) {

        try {

            const oldMessage = await channel.messages.fetch(
                config.scheduleMessageID
            );

            await oldMessage.edit({
                embeds: [scheduleEmbed],
                components: goalButtons
            });

            console.log("Schedule updated");

        }

        catch (error) {

            console.log("Old schedule not found. Creating new one.");

            const newMessage = await channel.send({
                embeds: [scheduleEmbed],
                components: goalButtons
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
            embeds: [scheduleEmbed],
            components: goalButtons
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

    //check for new week
    cron.schedule(
        "0 0 * * *",
        async () => {
            console.log("Checking for new week...");

            if (checkForNewWeek()) {
                try {
                    const channel = await client.channels.fetch(
                        config.scheduleChannelID
                    );

                    await updateScheduleMessage(
                        channel,
                        client.user
                    );

                    console.log("Schedule reset to default.");
                }
                catch (error) {
                    console.log(error);
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

    checkForNewWeek();

    if (message.content === "!schedule") {
        await updateScheduleMessage(
            message.channel,
            message.author
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

        const parts = command.split(" ");

        let day;
        let updatesText;

        //check if first arg is a day
        const possibleDay = formatDay(parts[0]);

        if (schedule.weekDays[possibleDay]) {

            //if day was provided
            day = possibleDay;

            updatesText = command
                .substring(part[0].length)
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

    else if(message.content.startsWith("!goals")){

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
            if (schedule.weekDays[possibleDay]){
                day = possibleDay;

                goalsText = command.substring(parts[0].length).trim();
            }
            else{
                day = DateTime.now()
                    .setZone(schedule.timezone)
                    .toFormat("cccc");
                
                goalsText = command;
            }

            if (!goalsText){
                const errorMessage = await message.reply("Provide at least one goal to add.");

                deleteMessagesAfter(
                    message,
                    errorMessage,
                    10000
                );

                return;
            }

            const goals = goalsText.split(",");

            for (let goal of goals){
                goal = goal.trim();

                if (!goal){
                    continue;
                }

                schedule.weekDays[day].goals.push(
                    {
                        text: goal,
                        completed: false //assume goal isnt completed upon addition
                    }
                );
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

//button click handler
client.on("interactionCreate", async interaction => {

    if (interaction.isButton()){
        return;
    }

    const parts = interaction.customId.split("_");

    if(parts[0] !== "goal"){
        return;
    }

    const day = parts[1];
    const index = Number(parts[2]);

    schedule.weekDays[day].goals[index].completed = !schedule.weekDays[days].goals[index].compelted;

    saveSchedule();

    await interaction.update(
        createScheduleMessage(
            interaction.user
        )
    );
});

client.login(process.env.TOKEN);