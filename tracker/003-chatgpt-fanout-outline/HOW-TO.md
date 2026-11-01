# How to do the "ChatGPT fan-out" trick (from the @chai.pe.business reel)

**Idea:** ChatGPT doesn't search your exact words. It splits your question into several searches.
If your article covers what ranks for *those* searches, AI is more likely to use and cite it.

## You (on your MacBook, Chrome), 5 minutes
1. Open **chatgpt.com** and log in.
2. Press **Cmd + Option + I** to open the developer tools, then click the **Network** tab.
3. Ask ChatGPT your topic as a buyer would, with web search on.
   Example: *"Which agency should I hire for SEO in Ahmedabad?"*
4. In the Network list, click the newest **conversation** request, open **Response**, press **Cmd + F**
   and search for **queries**. You'll see the actual searches ChatGPT ran, e.g.
   `"best SEO agency Ahmedabad reviews"`, `"SEO agency Ahmedabad pricing"`.
5. Copy those searches and paste them to Claude.

## Claude does the rest
6. Finds the top 3 Google results for each search.
7. Pulls their headings (same as the SEO Chrome extension in the reel).
8. Merges the best parts into one outline, adds what none of them cover, then writes the article.

## Prompt (if you want to do step 8 yourself in any AI)
> Here are the headings from the top 3 ranking articles for [topic]. Merge the best elements into one
> comprehensive outline. Keep it in the order a buyer thinks. Add a 50-word direct answer at the top,
> a FAQ section, and one section none of these articles cover. Then list what proof (numbers, examples)
> each section needs.

See `demo-outline.md` for a finished example.
