#!/usr/bin/env node

const {Octokit} = require("@octokit/rest");

// --- CONFIGURATION FROM ENVIRONMENT ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SEARCH_TOKEN = process.env.SEARCH_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;

if (!GITHUB_TOKEN || !SEARCH_TOKEN || !GITHUB_REPOSITORY) {
    console.error("❌ Missing required environment variables:");
    console.error("  GITHUB_TOKEN:", !!GITHUB_TOKEN);
    console.error("  SEARCH_TOKEN:", !!SEARCH_TOKEN);
    console.error("  GITHUB_REPOSITORY:", !!GITHUB_REPOSITORY);
    process.exit(1);
}

const [owner, repo] = GITHUB_REPOSITORY.split('/');
const USERNAME = owner;

// --- OCTOKIT CLIENTS ---
// Search client uses PAT for reading public PRs from other repos
const searchOctokit = new Octokit({auth: SEARCH_TOKEN});
// Default client uses GITHUB_TOKEN for updating issues in this repo
const defaultOctokit = new Octokit({auth: GITHUB_TOKEN});

// --- FORMATTING HELPERS ---
const cleanTitle = (title) => {
    // Removes conventional commit prefixes (e.g., "fix(core):")
    let clean = title.replace(/^(fix|feat|docs|refactor|chore|style|perf|test|ci)(\(.*\))?!?:?\s*/, '');
    // Capitalize first letter and replace pipes to avoid breaking Markdown tables
    return clean.charAt(0).toUpperCase() + clean.slice(1).replace(/\|/g, '-');
};

const getStatus = (pr) => {
    if (pr.pull_request.merged_at) return '🟢 Merged';
    if (pr.state === 'closed') return '🔴 Closed';
    return '🟡 In Review';
};

const getRepoName = (url) => {
    // Extracts "owner/repo" from URL
    const parts = url.split('/');
    return parts[parts.length - 4] + '/' + parts[parts.length - 3];
};

// --- MAIN LOGIC ---
async function updateEcosystemIssue(allPrs, issueNumber, ecosystemName, filterKeyword) {
    // Filter PRs for this ecosystem
    let prs = allPrs.filter(pr => {
        const matchesEcosystem = pr.html_url.toLowerCase().includes(filterKeyword);
        const isMerged = !!pr.pull_request.merged_at;
        const isOpen = pr.state === 'open';
        return matchesEcosystem && (isMerged || isOpen);
    });

    // Keep only the top 20 after filtering
    prs = prs.slice(0, 20);
    console.log(`Filtered ${ecosystemName} PRs: ${prs.length}`);

    // Build Markdown table rows
    const tableRows = prs.map(pr => {
        const repoName = getRepoName(pr.html_url);
        const desc = cleanTitle(pr.title);
        const link = `[#${pr.number}](${pr.html_url})`;
        const status = getStatus(pr);
        const repoDisplay = `**${repoName}**`;
        return `| ${repoDisplay} | ${desc} | ${link} | ${status} |`;
    }).join('\n');

    const issueBody = `
        This issue tracks my contributions to the **${ecosystemName} Ecosystem**.
        
        ### 🛠 ${ecosystemName} Contributions Dashboard
        
        | Repo / Project | Description | Link | Status |
        | :--- | :--- | :---: | :---: |
        ${tableRows}
        
        ---
        > *Last updated at: ${new Date().toUTCString()}*
    `;

    // Update the issue
    await defaultOctokit.rest.issues.update({
        owner: owner,
        repo: repo,
        issue_number: issueNumber,
        body: issueBody
    });

    console.log(`✅ Updated issue #${issueNumber} for ${ecosystemName}`);
}

async function main() {
    try {
        // Query: Public PRs authored by you, excluding this profile repo
        const query = `is:pr author:${USERNAME} is:public -repo:${USERNAME}/${repo} sort:created-desc`;
        console.log(`Searching with PAT: ${query}`);

        // Fetch 50 PRs to ensure we have enough after filtering
        const result = await searchOctokit.search.issuesAndPullRequests({
            q: query,
            per_page: 50
        });

        const allPrs = result.data.items;
        console.log(`Raw PRs found: ${allPrs.length}`);

        // Update both ecosystems
        await updateEcosystemIssue(allPrs, 1, 'Angular', 'angular');
        await updateEcosystemIssue(allPrs, 2, 'Nx', 'nrwl');

        console.log('🎉 All dashboards updated successfully!');
    } catch (error) {
        console.error('❌ Error updating dashboards:', error.message);
        process.exit(1);
    }
}

// Run the script
main();
