const express = require("express");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

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

const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SISTEMAS_VALIDOS = ["atm", "bodycam"];

function normalizarSistema(sistema) {
	if (!sistema) return "atm";
	sistema = String(sistema).toLowerCase();
	return SISTEMAS_VALIDOS.includes(sistema) ? sistema : null;
}

async function placeEstaLiberado(sistema, placeId) {
	const { data, error } = await supabase
		.from("whitelist_places")
		.select("id")
		.eq("sistema", sistema)
		.eq("place_id", String(placeId))
		.maybeSingle();

	if (error) {
		console.error("Erro ao consultar Supabase:", error);
		return false;
	}

	return !!data;
}

async function liberarPlace(sistema, placeId) {
	const { data: existente, error: erroConsulta } = await supabase
		.from("whitelist_places")
		.select("id")
		.eq("sistema", sistema)
		.eq("place_id", String(placeId))
		.maybeSingle();

	if (erroConsulta) {
		console.error("Erro ao consultar antes de liberar:", erroConsulta);
		return false;
	}

	if (existente) return true;

	const { error: erroInsert } = await supabase
		.from("whitelist_places")
		.insert({
			sistema,
			place_id: String(placeId)
		});

	if (erroInsert) {
		console.error("Erro ao inserir PlaceId:", erroInsert);
		return false;
	}

	return true;
}

async function removerPlace(sistema, placeId) {
	const { error } = await supabase
		.from("whitelist_places")
		.delete()
		.eq("sistema", sistema)
		.eq("place_id", String(placeId));

	if (error) {
		console.error("Erro ao remover PlaceId:", error);
		return false;
	}

	return true;
}

async function listarPlaces(sistema) {
	const { data, error } = await supabase
		.from("whitelist_places")
		.select("place_id")
		.eq("sistema", sistema)
		.order("created_at", { ascending: true });

	if (error) {
		console.error("Erro ao listar PlaceIds:", error);
		return [];
	}

	return data.map(item => item.place_id);
}

app.get("/", (req, res) => {
	res.send("API de whitelist online com Supabase.");
});

app.get("/check", async (req, res) => {
	const placeId = req.query.placeId;
	const sistema = normalizarSistema(req.query.s || "atm");

	if (!sistema || !placeId) {
		return res.json({ allowed: false });
	}

	const allowed = await placeEstaLiberado(sistema, placeId);

	return res.json({
		allowed,
		sistema,
		placeId: String(placeId)
	});
});

app.get("/c", async (req, res) => {
	const sistema = normalizarSistema(req.query.s || "atm");
	const placeId = req.query.p;

	if (!sistema || !placeId) {
		return res.json({ a: false });
	}

	const allowed = await placeEstaLiberado(sistema, placeId);

	return res.json({
		a: allowed
	});
});

app.get("/debug", async (req, res) => {
	const sistema = normalizarSistema(req.query.s || "atm");
	const placeId = req.query.p;

	const { data, error } = await supabase
		.from("whitelist_places")
		.select("*")
		.eq("sistema", sistema)
		.eq("place_id", String(placeId));

	return res.json({
		sistema,
		placeId: String(placeId),
		supabaseUrl: process.env.SUPABASE_URL,
		error: error ? {
			message: error.message,
			code: error.code,
			details: error.details
		} : null,
		rows: data
	});
});

app.listen(PORT, () => {
	console.log("API online na porta " + PORT);
});

// BOT DISCORD
const client = new Client({
	intents: [GatewayIntentBits.Guilds]
});

const sistemaOption = option =>
	option
		.setName("sistema")
		.setDescription("Sistema que deseja controlar")
		.setRequired(true)
		.addChoices(
			{ name: "ATM", value: "atm" },
			{ name: "Body Cam", value: "bodycam" }
		);

const commands = [
	new SlashCommandBuilder()
		.setName("liberar")
		.setDescription("Libera um PlaceId para usar um sistema.")
		.addStringOption(sistemaOption)
		.addStringOption(option =>
			option
				.setName("placeid")
				.setDescription("ID do place Roblox")
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	new SlashCommandBuilder()
		.setName("remover")
		.setDescription("Remove um PlaceId da whitelist de um sistema.")
		.addStringOption(sistemaOption)
		.addStringOption(option =>
			option
				.setName("placeid")
				.setDescription("ID do place Roblox")
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	new SlashCommandBuilder()
		.setName("listar")
		.setDescription("Lista PlaceIds liberados de um sistema.")
		.addStringOption(sistemaOption)
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

	try {
		await interaction.deferReply({
			flags: 64
		});

		if (interaction.commandName === "liberar") {
			const sistema = interaction.options.getString("sistema");
			const placeId = interaction.options.getString("placeid");

			if (!/^\d+$/.test(placeId)) {
				return interaction.editReply({
					content: "❌ PlaceId inválido. Use apenas números."
				});
			}

			const ok = await liberarPlace(sistema, placeId);

			if (!ok) {
				return interaction.editReply({
					content: "❌ Erro ao liberar no Supabase."
				});
			}

			return interaction.editReply({
				content: "✅ Liberado `" + placeId + "` para o sistema `" + sistema + "`."
			});
		}

		if (interaction.commandName === "remover") {
			const sistema = interaction.options.getString("sistema");
			const placeId = interaction.options.getString("placeid");

			if (!/^\d+$/.test(placeId)) {
				return interaction.editReply({
					content: "❌ PlaceId inválido. Use apenas números."
				});
			}

			const ok = await removerPlace(sistema, placeId);

			if (!ok) {
				return interaction.editReply({
					content: "❌ Erro ao remover no Supabase."
				});
			}

			return interaction.editReply({
				content: "✅ Removido `" + placeId + "` do sistema `" + sistema + "`."
			});
		}

		if (interaction.commandName === "listar") {
			const sistema = interaction.options.getString("sistema");
			const places = await listarPlaces(sistema);

			if (places.length === 0) {
				return interaction.editReply({
					content: "📋 Nenhum PlaceId liberado para `" + sistema + "`."
				});
			}

			return interaction.editReply({
				content: "📋 PlaceIds liberados para `" + sistema + "`:\n```" + places.join("\n") + "```"
			});
		}
	} catch (error) {
		console.error("Erro ao responder interação:", error);

		try {
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({
					content: "❌ Ocorreu um erro interno ao executar o comando."
				});
			}
		} catch (e) {
			console.error("Erro ao enviar mensagem de erro:", e);
		}
	}
});

registrarComandos()
	.then(() => {
		client.login(process.env.DISCORD_TOKEN);
	})
	.catch(error => {
		console.error("Erro ao iniciar:", error);
	});
