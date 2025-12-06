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
async function updateEcosystemIssue(prs, issueNumber, ecosystemName) {
    // Filter to only merged or open PRs, then keep top 20
    prs = prs.filter(pr => {
        const isMerged = !!pr.pull_request.merged_at;
        const isOpen = pr.state === 'open';
        return isMerged || isOpen;
    }).slice(0, 20);

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
> *Last updated: ${new Date().toUTCString()}*
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
        // Fetch PRs for each ecosystem with targeted queries

        // 1. Angular ecosystem - search in angular org
        const angularQuery = `is:pr author:${USERNAME} is:public org:angular sort:created-desc`;
        console.log(`Searching Angular PRs: ${angularQuery}`);
        const angularResult = await searchOctokit.search.issuesAndPullRequests({
            q: angularQuery,
            per_page: 50
        });
        console.log(`Raw Angular PRs found: ${angularResult.data.items.length}`);

        // 2. Nx ecosystem - search in nrwl org
        const nxQuery = `is:pr author:${USERNAME} is:public org:nrwl sort:created-desc`;
        console.log(`Searching Nx PRs: ${nxQuery}`);
        const nxResult = await searchOctokit.search.issuesAndPullRequests({
            q: nxQuery,
            per_page: 50
        });
        console.log(`Raw Nx PRs found: ${nxResult.data.items.length}`);

        // 3. Other open source - exclude angular, nrwl, doctypedev, and personal repos
        const otherQuery = `is:pr author:${USERNAME} is:public -org:angular -org:nrwl -org:doctypedev -user:${USERNAME} sort:created-desc`;
        console.log(`Searching Other PRs: ${otherQuery}`);
        const otherResult = await searchOctokit.search.issuesAndPullRequests({
            q: otherQuery,
            per_page: 50
        });
        console.log(`Raw Other PRs found: ${otherResult.data.items.length}`);

        // Update all ecosystems
        await updateEcosystemIssue(angularResult.data.items, 1, 'Angular');
        await updateEcosystemIssue(nxResult.data.items, 2, 'Nx');
        await updateEcosystemIssue(otherResult.data.items, 3, 'Other Open Source Projects');

        console.log('🎉 All dashboards updated successfully!');
    } catch (error) {
        console.error('❌ Error updating dashboards:', error.message);
        process.exit(1);
    }
}

// Run the script
main();
