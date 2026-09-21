const { Client, GatewayIntentBits, PresenceUpdateStatus, Collection } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

// Create a new client instance with necessary intents and status
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    presence: {
        status: PresenceUpdateStatus.Online,
    },
});

// Load command files from the commands folder
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    fs.readdirSync(commandsPath)
        .filter((file) => file.endsWith('.js'))
        .forEach((file) => {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);

            // Support prefix commands and slash commands
            const commandName = command.data ? command.data.name : command.name;
            if (commandName) {
                client.commands.set(commandName, command);
            } else {
                console.warn(`[WARNING] The command at ${filePath} is missing a "name" or "data.name" property.`);
            }
        });
}

// Load module files from the modules folder
const modulesPath = path.join(__dirname, 'modules');
if (fs.existsSync(modulesPath)) {
    fs.readdirSync(modulesPath)
        .filter((file) => file.endsWith('.js'))
        .forEach((file) => {
            const module = require(path.join(modulesPath, file));
            module(client);
        });
}

// Handle slash command interactions
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command || typeof command.execute !== 'function') return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing slash command ${interaction.commandName}:`, error);
        const errorPayload = { content: 'There was an error executing this command!', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorPayload).catch(() => {});
        } else {
            await interaction.reply(errorPayload).catch(() => {});
        }
    }
});

// Handle text-based prefix commands
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName);
    if (!command || typeof command.execute !== 'function') return;

    try {
        await command.execute(message, args);
    } catch (error) {
        console.error(`Error executing text command ${commandName}:`, error);
        await message.reply({ content: 'There was an error executing that command!' }).catch(() => {});
    }
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Status: Online');
});

// Log in using the TOKEN environment variable
client.login(process.env.TOKEN);

module.exports = client;
