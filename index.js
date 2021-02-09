const core = require("@actions/core");
const { Octokit } = require("@octokit/core");
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

(async () => {
  const username = process.env.GITHUB_REPOSITORY.split("/")[0];
  const repo = process.env.GITHUB_REPOSITORY.split("/")[1];
  const filePath = core.getInput("path");
  const repoFullName = process.env.GITHUB_REPOSITORY;

  let markdownContent = core
    .getInput("template")
    .replace(/\${\w{0,}}/g, (match) => {
      switch (match) {
        case "${welcome}":
          return core.getInput("welcome");
        case "${presentation}":
          return core.getInput("presentation");
        case "${contact}":
          return core.getInput("contact");
        case "${projectListTitle}":
          return core.getInput("projectListTitle");

        default:
          console.error(`${match} is not recognised`);
          return "";
      }
    });

  const getReadme = await octokit
    .request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner: username,
      repo: repo,
      path: filePath,
    })
    .catch((e) => {
      console.error("Failed: ", e);
      core.setFailed("Failed: ", e.message);
    });
  const sha = getReadme.data.sha;

  const getActivity = await octokit
    .request(`GET /users/{username}/repos?per_page=100`, {
      username: username,
    })
    .catch((e) => {
      console.error("Failed: ", e);
      core.setFailed("Failed: ", e.message);
    });
  const repos = [];
  getActivity.data.forEach(
    ({ html_url, description, name, full_name, fork, language }) => {
      if (!fork) {
        const obj = {
          full_name,
          commits: 0,
          html_url,
          description,
          name,
          language,
        };
        repos.push(obj);
      }
    }
  );
  const reposCountCommits = [];
  for (let element of repos) {
    const repoName = element.full_name;
    const repoCommits = await octokit
      .request(`GET /repos/${repoName}/commits?per_page=100`)
      .catch((e) => {
        console.error("Failed: ", e);
        core.setFailed("Failed: ", e.message);
      });
    const repoCommitsCount = repoCommits.data.length;

    element.commits = repoCommitsCount;
    if (repoFullName != element.full_name) {
      reposCountCommits.push(element);
    }
  }

  const sortedRepos = reposCountCommits
    .sort((a, b) => {
      return a.commits - b.commits;
    })
    .reverse();

  for (let element of sortedRepos) {
    const {
      name,
      full_name,
      commits,
      description,
      language,
      html_url,
    } = element;
    markdownContent +=
      `
## [${name}](${html_url})

**${full_name}** have been developed mainly in **${language}** and has **${commits}** commits.

` +
      "``` " +
      description +
      " ```\n\n";
  }

  const pushResponse = await octokit
    .request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner: username,
      repo: repo,
      path: filePath,
      message: `(Automated) Update ${filePath}`,
      content: Buffer.from(markdownContent, "utf8").toString("base64"),
      sha: sha,
    })
    .catch((e) => {
      console.error("Failed: ", e);
      core.setFailed("Failed: ", e.message);
    });
  console.log("Log", username, repo, filePath, sha, pushResponse);
})();
