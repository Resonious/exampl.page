/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const hostnameSplit = url.hostname.split('.');

		console.log(hostnameSplit);

		if (hostnameSplit.length <= 2) {
			if (url.pathname === '/favicon.svg') {
				return new Response(
					`<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="45" stroke="#34A853" stroke-width="4" fill="#FBBC05" />
  <text x="50%" y="55%" text-anchor="middle" font-size="50" font-family="Arial" fill="#4285F4">E</text>
</svg>`,
					{
						headers: {
							'content-type': 'image/svg+xml',
						},
					},
				);
			}

			return new Response(
				`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<link rel="icon" type="image/svg+xml" href="/favicon.svg">
		<title>exampl.page</title>
		<style>
			body {
				font-family: system-ui, sans-serif;
				line-height: 1.6;
				max-width: 800px;
				margin: 0 auto;
				padding: 2rem;
			}
		</style>
	</head>
	<body>
		<h1>exampl.page</h1>
		<p>Instantly generate example pages. Just visit <span><span style="color: red">anything</span>.exampl.page</span></p>
		<p>
			Examples:
			<ul>
				<li><a href="https://dogs-and-cats.exampl.page">https://dogs-and-cats.exampl.page</a></li>
				<li><a href="https://online-fruit-store.exampl.page">https://online-fruit-store.exampl.page</a></li>
				<li><a href="https://you-rock.exampl.page">https://you-rock.exampl.page</a></li>
			</ul>
		</p>
		</body>
</html>`,
				{
					headers: {
						'Content-Type': 'text/html',
					},
				},
			);
		}

		if (url.pathname !== '/' && !url.pathname.endsWith('.png')) {
			return new Response('not found', { status: 404 });
		}

		const subdomain = hostnameSplit[0];

		if (request.method == 'DELETE') {
			await env.EXAMPL_PAGES.delete(subdomain);
			const keys = await env.EXAMPL_PAGES.list({ prefix: subdomain });
			for (const key of keys.keys) {
				await env.EXAMPL_PAGES.delete(key.name);
			}
			return new Response('Deleted');
		}

		const key = url.pathname.endsWith('.png') ? `${subdomain} ${url.pathname}` : subdomain;
		const contentType = url.pathname.endsWith('.png') ? `image/png` : `text/html`;

		const cached = await env.EXAMPL_PAGES.get(key, { type: 'stream' });
		if (cached) {
			return new Response(cached, {
				headers: {
					'Content-Type': contentType,
				},
			});
		}

		let content;
		if (url.pathname.endsWith('.png')) {
			content = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
				prompt: `illustration of ${url.pathname.replace('.png', '')} for ${subdomain}`,
				height: 512,
				width: 512,
			});
		} else {
			content = await openAI(
				env,
				`
				Please generate me an example page of a website. It needs to be a single HTML file, with all CSS
				as inline style tags. Feel free to use Google web fonts if desired.
				Do not include any fake email addresses or links to other sites.
				If you want to include images, direct them to "/{descriptive_word}.png".
				The theme of the website is "${subdomain}".

				Respond with code only. No explanation is desired.

				Include <link rel="icon" type="image/png" href="/favicon.png"> in the <head> tag.
			`,
			);
		}

		if (!(typeof content === 'string' || content instanceof ReadableStream)) {
			console.error('Bad content', content);
			return new Response('Please try again', {
				status: 503,
			});
		}

		let responseContent = content;
		if (typeof responseContent === 'string') {
			if (responseContent.startsWith('```html')) {
				responseContent = responseContent.slice(8);
			}
			if (responseContent.endsWith('```')) {
				responseContent = responseContent.slice(0, -3);
			}
		}

		let kvContent;
		if (responseContent instanceof ReadableStream) {
			const [a, b] = responseContent.tee();
			kvContent = a;
			responseContent = b;
		} else {
			kvContent = responseContent;
		}

		const expirationTtl = 60 * 60 * 24 * 60;
		await env.EXAMPL_PAGES.put(key, kvContent, { expirationTtl });

		return new Response(responseContent, {
			headers: {
				'Content-Type': contentType,
			},
		});
	},
} satisfies ExportedHandler<Env>;

async function openAI(env: Env, prompt: string): Promise<string | null> {
	const API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

	const response = await fetch(API_ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${(env as any).OPENAI_API_KEY}`,
		},
		body: JSON.stringify({
			model: 'gpt-4o-mini',
			messages: [
				{
					role: 'user',
					content: prompt,
				},
			],
		}),
	});

	const data = (await response.json()) as any;
	const { content } = data.choices[0].message;

	if (typeof content !== 'string') {
		console.error(data);
		return null;
	}

	return content;
}
