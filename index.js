const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const iPad = puppeteer.pptr.devices['iPad'];
const fast3G = puppeteer.pptr.networkConditions['Fast 3G'];

let videos = [];
let viewCount;

const hashtag = process.argv[2];

if (!hashtag) {
    throw new Error('Hashtag is missing. Pass hashtag as an argument to script. Example: npm run start -- firetrucks');
}

const loadVideos = (items) => {
    videos = [
        ...videos,
        ...items.map(item => ({
            url: `https://www.tiktok.com/@${item.author.uniqueId}/video/${item.id}`,
            likes: item.stats.diggCount,
            comments: item.stats.commentCount,
            shares: item.stats.shareCount,
            views: item.stats.playCount
        }))
    ];
};

const scrollToBottom = async (page) => {
    // Add 5s delay
    await new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, 5000);
    });

    await page.evaluate(async () => {
        await new Promise((resolve) => {
            const totalHeight = 0;
            const distance = Math.floor(Math.random() * 400);
            const timer = setInterval(() => {
                const scrollHeight = document.scrollingElement.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if(totalHeight >= scrollHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 1000);
        });
    });
};

const listenDOMChange = async (page) => {
    console.log(`Current videos: ${videos.length}`);
    await page.waitForFunction(
        (selector, videos) => document.querySelectorAll(selector).length > videos.length,
        {},
        'a.video-feed-item-wrapper',
        videos
    );
};

const writeJSON = () => {
    fs.writeFileSync(
        path.join(__dirname, 'json', `${hashtag}_${new Date().toISOString().split('.')[0].replace(/:/g, '')}Z.json`),
        JSON.stringify({
            hashtag,
            views: viewCount,
            videos: videos.slice(0, 100)
        })
    );
};

(async () => {
    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();
    await page.emulate(iPad);
    await page.emulateNetworkConditions(fast3G);
    page.setDefaultTimeout(0);

    try {
        await page.goto(`https://www.tiktok.com/tag/${hashtag}`, {
            waitUntil: 'domcontentloaded'
        });

        page.on('response', (response) => {
            console.log(`Listening ${response.url()}...`);
            if (response.url().startsWith('https://m.tiktok.com/api/challenge/item_list/')) {
                response.json().then(async ({ itemList, hasMore }) => {
                    loadVideos(itemList);

                    console.log(`Loaded ${itemList.length} videos. Total: ${videos.length}`);

                    if (videos.length < 100 && hasMore) {
                        await scrollToBottom(page);
                        await listenDOMChange(page);
                    } else {
                        await browser.close();
                        writeJSON();
                    }
                });
            }
        });

        const scriptTxt = await page.$eval('script[id="__NEXT_DATA__"]', (el) => el.innerText);
        const script = JSON.parse(scriptTxt);
        viewCount = script.props.pageProps.challengeInfo.stats.viewCount;
        loadVideos(script.props.pageProps.items || []);
        await listenDOMChange(page);
    } catch (e) {
        console.log('Error:', e);
        await browser.close();
    }

})();
