const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./bot.db", (err) => {
    if (err) {
        console.error(err.message);
    }
    else {
        console.log("Connected to SQLite database.");
    }
});

db.serialize(() => {

    db.run(
        `
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY,
            scheduleChannelID TEXT,
            scheduleMessageID TEXT
        )
        `
    );

    db.run(
        `
        INSERT OR IGNORE INTO settings (id)
        VALUES(1)
        `
    );

});

//get saved settings
function getSettings(callback){
    db.get(
        "SELECT * FROM settings WHERE id = 1",
        callback
    );
}

//update settings
function updateSettings(channelID, messageID){
    db.run(
        `UPDATE settings
        SET scheduleChannelID = ?,
            scheduleMessageID = ?
        WHERE id = 1
        `,
        [
            channelID,
            messageID
        ],
        (err) => {
            if(err){
                console.error("Database update failed:", err);
            }
        }
    );
}

module.exports = {
    getSettings,
    updateSettings
};