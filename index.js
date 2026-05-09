const fs = require("fs");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

const {
	Client,
	GatewayIntentBits,
	REST,
	Routes,
	SlashCommandBuilder,
	PermissionFlagsBits
} = require("discord.js");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const WHITELIST_FILE = path.join(__dirname, "whitelist.json");

function carregarWhitelist() {
	if (!fs.existsSync(WHITELIST_FILE)) {
		fs.writeFileSync(WHITELIST_FILE, JSON.stringify({ places: [] }, null, 2));
	}

	const raw = fs.readFileSync(WHITELIST_FILE, "utf8");
	return JSON.parse(raw);
}

function salvarWhitelist(data) {
	fs.writeFileSync(WHITELIST_FILE, JSON.stringify(data, null, 2));
}

function placeEstaLiberado(placeId) {
	const data = carregarWhitelist();
	return data.places.includes(String(placeId));
}

// ROTA NORMAL
app.get("/check", (req, res) => {
	const placeId = req.query.placeId;

	if (!placeId) {
		return res.json({
			allowed: false,
			reason: "PlaceId não enviado."
		});
	}

	const allowed = placeEstaLiberado(placeId);

	return res.json({
		allowed: allowed,
		placeId: String(placeId)
	});
});

// ROTA ESCONDIDA PARA O SCRIPT OFUSCADO
app.get("/c", (req, res) => {
	const p = req.query.p;

	if (!p) {
		return res.json({
			a: false
		});
	}

	const ok = placeEstaLiberado(p);

	return res.json({
		a: ok
	});
});

// ROTA DE TESTE
app.get("/", (req, res) => {
	res.send("API de whitelist online com Supabase.");
});

app.listen(PORT, () => {
	console.log("API online na porta " + PORT);
});

// BOT DISCORD
const client = new Client({
	intents: [GatewayIntentBits.Guilds]
});

const commands = [
	new SlashCommandBuilder()
		.setName("liberar")
		.setDescription("Libera um PlaceId para usar o script.")
		.addStringOption(option =>
			option
				.setName("placeid")
				.setDescription("ID do place Roblox")
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	new SlashCommandBuilder()
		.setName("remover")
		.setDescription("Remove um PlaceId da whitelist.")
		.addStringOption(option =>
			option
				.setName("placeid")
				.setDescription("ID do place Roblox")
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	new SlashCommandBuilder()
		.setName("listar")
		.setDescription("Mostra todos os PlaceIds liberados.")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

async function registrarComandos() {
	const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

	await rest.put(
		Routes.applicationGuildCommands(
			process.env.CLIENT_ID,
			process.env.GUILD_ID
		),
		{ body: commands }
	);

	console.log("Comandos registrados no Discord.");
}

client.once("clientReady", () => {
	console.log("Bot online como " + client.user.tag);
});

client.on("interactionCreate", async interaction => {
	if (!interaction.isChatInputCommand()) return;

	if (interaction.commandName === "liberar") {
		const placeId = interaction.options.getString("placeid");

		if (!/^\d+$/.test(placeId)) {
			return interaction.reply({
				content: "❌ Esse PlaceId é inválido. Use apenas números.",
				ephemeral: true
			});
		}

		const data = carregarWhitelist();

		if (data.places.includes(placeId)) {
			return interaction.reply({
				content: "⚠️ Esse PlaceId já está liberado: `" + placeId + "`",
				ephemeral: true
			});
		}

		data.places.push(placeId);
		salvarWhitelist(data);

		return interaction.reply({
			content: "✅ PlaceId liberado com sucesso: `" + placeId + "`",
			ephemeral: true
		});
	}

	if (interaction.commandName === "remover") {
		const placeId = interaction.options.getString("placeid");

		const data = carregarWhitelist();
		const antes = data.places.length;

		data.places = data.places.filter(id => id !== placeId);
		salvarWhitelist(data);

		if (data.places.length === antes) {
			return interaction.reply({
				content: "⚠️ Esse PlaceId não estava liberado: `" + placeId + "`",
				ephemeral: true
			});
		}

		return interaction.reply({
			content: "✅ PlaceId removido da whitelist: `" + placeId + "`",
			ephemeral: true
		});
	}

	if (interaction.commandName === "listar") {
		const data = carregarWhitelist();

		if (data.places.length === 0) {
			return interaction.reply({
				content: "📋 Nenhum PlaceId liberado ainda.",
				ephemeral: true
			});
		}

		return interaction.reply({
			content: "📋 PlaceIds liberados:\n```" + data.places.join("\n") + "```",
			ephemeral: true
		});
	}
});

registrarComandos()
	.then(() => {
		client.login(process.env.DISCORD_TOKEN);
	})
	.catch(error => {
		console.error("Erro ao iniciar:", error);
	});
