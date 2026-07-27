const { updateSettings, getSettings } = require("./database");

updateSettings(null, null);

getSettings((err, row) => {
    if (err) {
        console.error(err);
        return;
    }

    console.log(row);
});