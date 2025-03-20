"use strict";
const amqp = require("amqplib");
const axios = require("axios");
const https = require("https");
const configEnv = require("./../config/Dev.js");

const rabbitMqUrl = configEnv.RabbitMqConnection;
const queueName = configEnv.QueueName;
const authorityPath = configEnv.Authority;
const client_id = configEnv.client_id;
const client_secret = configEnv.client_secret;
const client_scope = configEnv.client_scope;
/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema Moleculer's Service Schema
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

/** @type {ServiceSchema} */
module.exports = {
	name: "greeter",

	/**
	 * Settings
	 */
	settings: {},

	/**
	 * Dependencies
	 */
	dependencies: [],

	/**
	 * Actions
	 */
	actions: {
		/**
		 * Say a 'Hello' action.
		 *
		 * @returns
		 */
		hello: {
			rest: {
				method: "GET",
				path: "/hello",
			},
			async handler() {
				return "Hello Moleculer";
			},
		},
	},

	/**
	 * Events
	 */
	events: {},

	/**
	 * Methods
	 */
	methods: {
		async consumeConnect() {
			try {
				const connection = await amqp.connect(rabbitMqUrl);
				const channel = await connection.createChannel();
				await channel.assertQueue(queueName, { durable: true });

				console.log(
					`[*] Consumer ${process.pid} waiting for messages. To exit press CTRL+C`
				);
				const retryLimit = 5;
				await channel.prefetch(1);
				channel.consume(
					queueName,
					async (msg) => {
						if (msg === null || msg.content === null) {
							channel.reject(msg, false);
							console.error("Message is null !");
							console.log(`[x] Received message: ${message}`);
							return;
						}
						const message = msg.content.toString();
						console.log(`[x] Received message: ${message}`);

						const consumerDataModel = JSON.parse(message);

						let retryCount = consumerDataModel.RetryCount || 0;

						const access_token = "access_token here";
						console.log("access token:", access_token);

						const config = {
							headers: {
								"Content-Type": "application/json",
								Authorization: "Bearer " + access_token,
							},
						};

						consumerDataModel.RetryCount = retryCount;
						consumerDataModel.TotalRetryCount = retryLimit;

						//#region accesstoken i�lemleri
						if (!access_token || !access_token.trim()) {
							console.error("Access token is empty.");
							if (retryCount < retryLimit) {
								console.log("Retrying...");
								retryCount++;

								channel.reject(msg, false);
								consumerDataModel.RetryCount = retryCount;
								channel.sendToQueue(
									queueName,
									Buffer.from(
										JSON.stringify(consumerDataModel)
									)
								);
								return;
							} else {
								console.error(
									"Access token is empty.Retry limit reached. Message cannot be processed."
								);
								channel.reject(msg, false);
								return;
							}
						}
						//#endregion

						try {
							const response = await axios.post(
								consumerDataModel.Path,
								consumerDataModel,
								config
							);
							console.log("Response:", response.data);
							channel.ack(msg);
						} catch (error) {
							console.error("Error:", error);
							if (retryCount < retryLimit) {
								console.log("Retrying...");
								retryCount++;

								channel.reject(msg, false);
								consumerDataModel.RetryCount = retryCount;
								channel.sendToQueue(
									queueName,
									Buffer.from(
										JSON.stringify(consumerDataModel)
									)
								);
								// channel.nack(msg);
							} else {
								console.error(
									"Retry limit reached. Message cannot be processed."
								);
								channel.reject(msg, false);
							}
						}
					},
					{ noAck: false }
				);
			} catch (error) {
				console.error("Error:", error);
			}
		},
	},

	/**
	 * Service created lifecycle event handler
	 */
	created() {},

	/**
	 * Service started lifecycle event handler
	 */
	async started() {
		await this.consumeConnect();
	},

	/**
	 * Service stopped lifecycle event handler
	 */
	async stopped() {},
};
