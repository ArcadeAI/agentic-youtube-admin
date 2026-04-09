import { Agent } from "@mastra/core/agent";

const SUMMARY_PROMPT = `You are summarizing a YouTube video transcript.
Write a clear, informative summary in 150-250 words.
Cover the main topics, key arguments, and any notable conclusions.
Do not include timestamps or speaker labels.`;

const summaryAgent = new Agent({
	id: "summary-agent",
	name: "Summary Agent",
	instructions: SUMMARY_PROMPT,
	model: "openai/gpt-4.1-mini",
});

export class SummaryService {
	async generateSummary(transcript: string): Promise<string> {
		const response = await summaryAgent.generate([
			{ role: "user", content: transcript },
		]);
		return response.text.trim();
	}
}
