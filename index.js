//import libraries
const dotenv = require("dotenv").config();
const phoenix = require("@phoenixlan/phoenix.js");
const amqp = require("amqplib/callback_api");
const {
    UTCDate
} = require("@date-fns/utc");
const {
    addHours,
    subMonths,
    differenceInMilliseconds,
    differenceInHours
} = require("date-fns");
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    Guild
} = require("discord.js");

//set time variables
let halfHour = 1800000;
let oneDay = 86400000;
//initialise the api
phoenix.init(process.env.INIT_URL);
//change this to token from login in the api
phoenix.User.Oauth.setAuthState(process.env.TOKEN, process.env.REFRESH_TOKEN);
//variable that controls the months before the next event crew roles should be removed
const timeBeforeNextEventRemove = parseInt(process.env.REMOVE_MONTHS);
//change this, guild id to ensure proper guild selection
let phoenixGuildId = process.env.GUILD_ID;
//set the discord token variable with the token from .env file
const DISCORD_TOKEN = process.env.BOT_TOKEN;
//change this to the rabbitmq address and port
amqp.connect(process.env.RABBITMQ_CONNECT_LINK, function (error0, connection) {
    if (error0) {
        throw error0;
    }
    connection.createChannel(function (error1, channel) {
        if (error1) {
            throw error1;
        }
        //change this
        let queue = "";


        channel.assertQueue(queue, {
            durable: true,
        });

        channel.consume(queue, async function (msg) {
            console.log(msg.content.toString());
            removeAllRoles();
            updateRoles();
        }, {
            noAck: true,
        });

    });
});
const phoenixClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

async function handleRoleRemoval() {
    const now = new UTCDate();
    const events = await phoenix.getEvents();
    const nextEventTimeOffsetted = events
        .map(event => subMonths(new UTCDate(event["start_time"] * 1000), timeBeforeNextEventRemove))
        .find(time => time.getTime() > now.getTime());
    if (!nextEventTimeOffsetted || differenceInHours(nextEventTimeOffsetted, now) > 25) {
        console.info("Skipping scheduled role removal");
        return;
    }

    console.log("Removing roles");
    removeAllRoles();
}
setInterval(() => {
    handleRoleRemoval();
}, oneDay);


async function removeAllRoles() {
    const guild = phoenixClient.guilds.cache.get(phoenixGuildId);
    try {
        const crews = await phoenix.Crew.getCrews();
        crews.forEach(async (crew) => {
            const allCrews = await phoenix.Crew.getCrew(crew.uuid);
            const readableCrew = allCrews.positions;
            readableCrew.forEach(async (position) => {
                if (position.chief) {
                    position.position_mappings.forEach(async (mapping) => {
                        let discordUser = await phoenix.User.getDiscordMapping(mapping.user.uuid);
                        if (discordUser !== null && discordUser.discord_id !== null) {
                            let roleVar = guild.roles.cache.find(role => role.name === "Gruppeleder");
                            let member = await guild.members.fetch(discordUser.discord_id);
                            await member.roles.remove(roleVar);
                        }
                    })
                } else {
                    position.position_mappings.forEach(async (mapping) => {
                        let discordUser = await phoenix.User.getDiscordMapping(mapping.user.uuid);
                        if (discordUser != null && discordUser.discord_id != null) {
                            let roleVar = guild.roles.cache.find(role => role.name === "Crew");
                            let member = await guild.members.fetch(discordUser.discord_id);
                            await member.roles.remove(roleVar);
                        }
                    })
                }
            });
        });
    } catch (error) {
        console.error("an error occured while deleting roles:", error);
    }

}

async function updateRoles() {
    //change this
    const guild = phoenixClient.guilds.cache.get(phoenixGuildId);
    let crews = await Promise.all((await phoenix.Crew.getCrews()));
    crews.forEach(async (crew) => {
        const allCrews = await phoenix.Crew.getCrew(crew.uuid);
        const readableCrew = allCrews.positions;
        readableCrew.forEach(async (position) => {
            if (position.chief === true) {
                position.position_mappings.forEach(async (mapping) => {
                    try {
                        let discordUser = await phoenix.User.getDiscordMapping(mapping.user.uuid);
                        if (discordUser != null && discordUser.discord_id != null) {
                            let roleVar = guild.roles.cache.find(role => role.name === "Gruppeleder");
                            let member = await guild.members.fetch(discordUser.discord_id);
                            await member.roles.add(roleVar);
                        }
                    } catch (error) {
                        console.error("an error occured while editing roles:", error);
                    }
                })
            } else {
                position.position_mappings.forEach(async (mapping) => {
                    try {
                        let discordUser = await phoenix.User.getDiscordMapping(mapping.user.uuid);
                        if (discordUser != null && discordUser.discord_id != null) {
                            let roleVar = guild.roles.cache.find(role => role.name === "Crew");
                            let member = await guild.members.fetch(discordUser.discord_id);
                            await member.roles.add(roleVar);
                        }
                    } catch (error) {
                        console.error("an error occured while editing roles:", error);
                    }
                })
            }
        });
    });
};


//when the bot turns on
phoenixClient.on("ready", () => {
    console.log(`Logged in as ${phoenixClient.user.tag}!`);
    updateRoles();
    setInterval(function () {
        updateRoles();
        console.log("half an hour has gone by, updating roles");
    }, halfHour);
});

//when someone joins the server
phoenixClient.on("guildMemberAdd", member => {
    updateRoles();
})

//when there is a new message in the server
phoenixClient.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.content.includes("chief")) {
        message.channel.send("det heter gruppeleder! :rage:");
    };
    const prefix = "!";
    //check if message is a command
    if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        //handle commands
        switch (command) {
            case "help":
                const helpEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle("Phoenix bot kommandoer")
                    .setDescription("Kommandoer du kan bruke")
                    .addFields({
                        name: "!help",
                        value: "Denne kommandoen. viser hvilke kommandoer du kan bruke"
                    }, {
                        name: "!roles",
                        value: "Oppdaterer roller.",
                    }, {
                        name: "!liam",
                        value: "Viser den nåværende tiden i Japan",
                    })
                    .setTimestamp()
                    .setFooter({
                        text: "Phoenix bot !help",
                    });
                message.reply({
                    embeds: [helpEmbed]
                });
                break;
            case "roles":
                //only runs if user has role "Administrasjon" in the discord server
                const guild = phoenixClient.guilds.cache.get(phoenixGuildId);
                const role = message.member.roles.cache.find(role => role.name === "Administrasjon")
                if (role) {
                    //removes roles and adds them again to make sure that if someone is removed from the crew, it will remove them first, then add all the people that are supposed to have roles
                    await Promise.all([
                        await removeAllRoles(),
                        await updateRoles(),
                    ]);
                    message.reply("roller oppdatert");
                } else {
                    message.reply("du har ikke tillatelse til å gjøre dette, kontakt administrasjonen.");
                };
                break;
            case "liam":
                //getting time in japan, where liam lives
                let liam_tid = new Date().toLocaleTimeString("nb-NO", {
                    timeZone: "JST"
                });
                message.reply("Liam bor i Japan som ligger " + 7 + " timer før Norge, tiden i japan er nå: " + liam_tid);
                break;
            default:
                message.reply("Dette var en kommando som ikke funket, se om du skrev den riktig eller skriv !help for å se alle kommandoer");
                break;
        }
    }
});

//logging in to the discord bot api with the bot token
phoenixClient.login(DISCORD_TOKEN);
