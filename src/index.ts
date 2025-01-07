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
		const subdomain = url.hostname.split('.')[0];

		if (request.method == 'DELETE') {
			await env.EXAMPL_PAGES.delete(subdomain);
			return new Response('Deleted');
		}

		const cached = await env.EXAMPL_PAGES.get(subdomain);
		if (cached) {
			return new Response(cached, {
				headers: {
					'Content-Type': 'text/html',
				},
			});
		}

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
						content: `
							Please generate me an example page of a website. It needs to be a single HTML file, with all CSS
							as inline style tags. Feel free to use Google web fonts if desired.
							Do not include any fake email addresses or links to other sites.
							The theme of the website is "${subdomain}".

							Respond with code only. No explanation is desired.
						`,
					},
				],
			}),
		});

		const data = (await response.json()) as any;
		const { content } = data.choices[0].message;

		if (typeof content !== 'string') {
			return new Response('Please try again', {
				status: 503,
			});
		}

		let responseContent = content;
		if (content.startsWith('```html')) {
			responseContent = content.slice(8);
		}
		if (content.endsWith('```')) {
			responseContent = responseContent.slice(0, -3);
		}

		await env.EXAMPL_PAGES.put(subdomain, responseContent);

		return new Response(responseContent, {
			headers: {
				'Content-Type': 'text/html',
			},
		});
	},
} satisfies ExportedHandler<Env>;
