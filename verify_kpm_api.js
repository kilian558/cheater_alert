const fs = require('fs');

// Simulate the data from the log for Grul68
const player = {
  "player": "Grul68",
  "kills": 0,
  "time_seconds": 4088,
  "kills_per_minute": 0
};

console.log("Player:", player.player);
console.log("Kills:", player.kills);
console.log("Time (seconds):", player.time_seconds);
console.log("API KPM:", player.kills_per_minute);

// Current Calculation Logic in JS
const playtimeMinutes = player.time_seconds / 60;
const calculatedKPM = playtimeMinutes > 0 ? player.kills / playtimeMinutes : 0;
console.log("Calculated KPM:", calculatedKPM.toFixed(2));

// Check if API KPM is available and reliable
if (player.kills_per_minute !== undefined) {
    console.log("API provides KPM directly. We should probably use it.");
}
