import { getConnection } from 'typeorm';
import * as request from 'supertest';
import express = require('express');

import * as config from '../config';
import { Db } from '../src';
import { meNamespace } from '../src/UserManagement/routes/me';
import { addRoutes as authMiddleware } from '../src/UserManagement/routes';
import { authenticationMethods as loginRoutes } from '../src/UserManagement/routes/auth';
import {
	REST_PATH_SEGMENT,
	TEST_CONNECTION_OPTIONS,
	TEST_JWT_SECRET,
	AUTH_MIDDLEWARE_ARGS,
	PATCH_ME_PROFILE_PAYLOAD,
	ME_NAMESPACE_ROUTES,
	PATCH_ME_PASSWORD_PAYLOAD,
	SUCCESSFUL_MUTATION_RESPONSE,
} from './constants';
import bodyParser = require('body-parser');
import { expectOwnerGlobalRole, rest } from './utils';

// TODO: https://github.com/johntron/superagent-prefix

describe('/me namespace', () => {
	let testServer: {
		app: express.Application;
		restEndpoint: string;
	};

	beforeAll(async () => {
		testServer = {
			app: express(),
			restEndpoint: REST_PATH_SEGMENT,
		};

		testServer.app.use(bodyParser.json());
		testServer.app.use(bodyParser.urlencoded({ extended: true }));

		config.set('userManagement.jwtSecret', TEST_JWT_SECRET);
		authMiddleware.apply(testServer, AUTH_MIDDLEWARE_ARGS);
		loginRoutes.apply(testServer);

		meNamespace.apply(testServer);

		await Db.init(TEST_CONNECTION_OPTIONS);
		await getConnection().runMigrations({ transaction: 'none' });
	});

	afterAll(() => getConnection().close());

	describe('If requester is unauthorized', () => {
		ME_NAMESPACE_ROUTES.forEach((route) => {
			const [method, endpoint] = route.split(' ').map((i) => i.toLowerCase());

			test(`${route} should return 401 Unauthorized`, async () => {
				// @ts-ignore TODO: module augmentation
				const response = await request(testServer.app)[method](rest(endpoint));

				expect(response.statusCode).toBe(401);
			});
		});
	});

	describe('If requester is authorized', () => {
		describe('If requester is shell user', () => {
			let agent: request.SuperAgentTest;

			beforeAll(async () => {
				agent = request.agent(testServer.app);
				await agent.get(`/${REST_PATH_SEGMENT}/login`);
			});

			test('GET /me should return their sanitized data', async () => {
				const response = await agent.get('/rest/me');

				expect(response.statusCode).toBe(200);

				const { id, email, firstName, lastName, personalizationAnswers, globalRole } =
					response.body.data;

				expect(typeof id).toBe('string');
				expect(email).toBeNull();
				expect(firstName).toBe('default');
				expect(lastName).toBe('default');
				expect(personalizationAnswers).toBeNull();

				expectOwnerGlobalRole(globalRole);
			});

			test('PATCH /me should return their updated sanitized data', async () => {
				const response = await agent.patch(rest('me')).send(PATCH_ME_PROFILE_PAYLOAD);

				expect(response.statusCode).toBe(200);

				const { id, email, firstName, lastName, personalizationAnswers, globalRole } =
					response.body.data;

				expect(typeof id).toBe('string');
				expect(email).toBe(PATCH_ME_PROFILE_PAYLOAD.email);
				expect(firstName).toBe(PATCH_ME_PROFILE_PAYLOAD.firstName);
				expect(lastName).toBe(PATCH_ME_PROFILE_PAYLOAD.lastName);
				expect(personalizationAnswers).toBeNull();

				expectOwnerGlobalRole(globalRole);
			});

			test('PATCH /me/password should return success response', async () => {
				const response = await agent.patch(rest('me/password')).send(PATCH_ME_PASSWORD_PAYLOAD);

				expect(response.statusCode).toBe(200);

				expect(response.body).toEqual(SUCCESSFUL_MUTATION_RESPONSE);
			});
		});
	});

	// function loginUser() {
	// 	return function (done) {
	// 		server.app
	// 			.post('/login')
	// 			.send({ username: 'admin', password: 'admin' })
	// 			.expect(302)
	// 			.expect('Location', '/')
	// 			.end(onResponse);

	// 		function onResponse(err, res) {
	// 			if (err) return done(err);
	// 			return done();
	// 		}
	// 	};
	// }
});
