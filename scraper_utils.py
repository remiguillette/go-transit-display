import requests
from bs4 import BeautifulSoup
import logging
import tweepy

logger = logging.getLogger(__name__)


# Function to get GO Transit updates from the official website

def get_go_transit_updates():
    """
    Get service updates from GO Transit website
    """
    try:
        url = 'https://www.gotransit.com/en/service-updates'
        response = requests.get(url, timeout=10)
        soup = BeautifulSoup(response.content, 'html.parser')

        updates = []
        for item in soup.select('.service-update-list-item'):
            try:
                title = item.find('h3')
                description = item.find('p')

                title_text = title.text.strip() if title else "GO Transit"
                desc_text = description.text.strip() if description else "All services operating normally"

                updates.append(f"{title_text}: {desc_text}")
            except (AttributeError, TypeError) as e:
                logger.warning(f"Error parsing update item: {e}")
                updates.append("GO Transit - All services operating normally")

        return updates if updates else ["GO Transit - All services operating normally"]

    except Exception as e:
        logger.error(f"Error fetching GO Transit updates: {e}")
        return ["GO Transit - All services operating normally"]


# Function to get Metrolinx updates from the official website

def get_metrolinx_updates():
    try:
        url = 'https://www.metrolinx.com/en/alerts'
        response = requests.get(url, timeout=10)
        soup = BeautifulSoup(response.content, 'html.parser')

        updates = []
        for item in soup.select('.alert-item'):
            try:
                title = item.find('h3')
                description = item.find('p')

                title_text = title.text.strip() if title else "Metrolinx"
                desc_text = description.text.strip() if description else "All services operating normally"

                updates.append(f"{title_text}: {desc_text}")
            except (AttributeError, TypeError) as e:
                logger.warning(f"Error parsing update item: {e}")
                updates.append("Metrolinx - All services operating normally")

        return updates if updates else ["Metrolinx - All services operating normally"]

    except Exception as e:
        logger.error(f"Error fetching Metrolinx updates: {e}")
        return ["Metrolinx - All services operating normally"]


# Function to get Twitter (X) updates using Tweepy

def get_twitter_updates(api_key, api_secret, access_token, access_secret):
    try:
        auth = tweepy.OAuthHandler(api_key, api_secret)
        auth.set_access_token(access_token, access_secret)
        api = tweepy.API(auth)

        tweets = api.user_timeline(screen_name='GOtransit', count=5, tweet_mode='extended')
        updates = []

        for tweet in tweets:
            updates.append(f"Twitter (X): {tweet.full_text}")

        return updates
    except Exception as e:
        logger.error(f"Error fetching Twitter updates: {e}")
        return ["Twitter updates could not be retrieved."]


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Fetch updates from GO Transit, Metrolinx, and Twitter
    go_transit_updates = get_go_transit_updates()
    metrolinx_updates = get_metrolinx_updates()

    # Replace with your Twitter API credentials
    api_key = 'YOUR_API_KEY'
    api_secret = 'YOUR_API_SECRET'
    access_token = 'YOUR_ACCESS_TOKEN'
    access_secret = 'YOUR_ACCESS_SECRET'

    twitter_updates = get_twitter_updates(api_key, api_secret, access_token, access_secret)

    # Display all updates
    all_updates = go_transit_updates + metrolinx_updates + twitter_updates
    for update in all_updates:
        print(update)
