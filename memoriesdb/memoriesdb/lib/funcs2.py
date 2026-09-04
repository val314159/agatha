#from utils import *
import json
import logging
#from . import utils
logger = logging.getLogger(__name__)


def mkdir(path: str) -> int:
  """
  creates a directory at the specified path

  Args:
   path (str): the name of the file.  can be absolute or relative.

  Returns:
    int: if it's a 0 it succeeded, if it's anything non-zero it failed.
  """
  logger.info("MKDIR %s", path)
  return 0


def read(path: str) -> str:
  """
  read the contents of a file located at the specified path

  Args:
   path (str): the name of the file.  can be absolute or relative.

  Returns:
    str: the content of the file
  """
  logger.debug("READ1")
  ret = ''.join(open(path).readlines())
  logger.debug("READ2 %r", ret)
  return ret


def respond_to_user(message: str) -> str:
  """
  Gives a response to a user,
  in case we can't find any other toolsg to use.

  Args:
    message (str): What to send to the user
                   so he reads what we sent.

  Returns:
    str: The result of telling the user our message.
  """
  logger.info("MSG type=%s message=%s", type(message), message)
  #utils.display_to_user(message)
  utils.get_display_to_user_func()(message)
  #mesg = utils.get_user_input_func()(record_response=False)
  mesg = utils.get_user_input_func()(record_response=False)
  logger.info("USER RESPONSE %s", mesg)
  #mesg = utils.get_user_input(record_response=False)
  return mesg


def add_two_numbers(a: int, b: int) -> int:
  """
  calculate the sum of two numbers added together

  Args:
    a (int): The first number
    b (int): The second number

  Returns:
    int: The sum of the two numbers added together
  """
  #qwqwqwq
  # The cast is necessary as returned tool call
  # arguments don't always conform exactly to schema
  # E.g. this would prevent "what is 30 + 12"
  # to produce '3012' instead of 42
  return int(a) + int(b)




def weather_forecast(location: str) -> str:
  """
  This will tell you what the weather's going to be like soon in the specified location.

  Args:
    location (str): The location of the weather forecast.  Examples would include buffalo, or 78712', here, or outside.

  Returns:
    str: This is the weather forecast for the location.  if it's blank, that means we couldnt find the location.
  """
  logger.info("FIND THE WEATHER FOR type=%s location=%r", type(location), location)
  return "Sunny with a 10% chance of rain"



def create_new_tweet(
    content: str,
    when: str
                     ) -> str:
  """
  this schedules/creates a new tweet event for social type of X/Twitter and also opens up a window for the user
  also known as scheduling a new tweet.

  Args:
    content (str): The text of the tweet to be posted.  needs to less than 160 characters in length.
    when (str): When the tweet is scheduled to be posted.  this can be an iso date, or a relative date such as 'today', 'yesterday', 'the day after tomorrow', 'next thursday', 'next next thursday', 'the wednesday past next'.

  Returns:
    int: the id for the new tweet event.  0 means there was an error.
  """

  """
    title (str): the title of the Tweet
    description (str): The description of the tweet.  needs to be under 80 characters in length.
  """
  logger.info("SCHEDULE TWEET when=%s content=%s", when, content)
  #print("SCHEDULE TWEET", title, description)
  return json.dumps(dict(
      result=dict(
          id="200",
#          title=title
      )))
      


def reschedule_tweet(#title: str, description: str,
    id: str,
                     when: str
                     ) -> str:
  """
  this reschedules an existing tweet to a new time/date.
  it's also knows as changing the time or date on a tweet.
  it also opens up a window for the user if they are logged in.

  Args:
    content (str): The text of the tweet to be posted.  needs to less than 160 characters in length.
    when (str): When the tweet is scheduled to be posted.  this can be an iso date, or a relative date such as 'today', 'yesterday', 'the day after tomorrow', 'next thursday', 'next next thursday', 'the wednesday past next'.

  Returns:
    int: the id for the new event.  0 means there was an error.
  """

  """
    title (str): the title of the Tweet
    description (str): The description of the tweet.  needs to be under 80 characters in length.
  """
  logger.info("RESCHEDULE TWEET id=%s", id)
  #print("SCHEDULE TWEET", title, description)
  return json.dumps(dict(
      result=dict(
          id=id,
#          title=title
      )))
      


def delete_tweet(id: str) -> str:
  """
  this deletes a tweet event for social type of X/Twitter

  Args:
    id (str): the id of tweet event

  Returns:
    int: the id of the deleted tweet event.  0 means there was an error.
  """
  logger.info("DELETE TWEET %r", id)
  return json.dumps(dict(
      result=dict(
          id=id
      )))
      

def edit_tweet(id: str) -> int:
  """
  this edits a tweet event for social type of X/Twitter.
  it does this by popping up a modal dialog box for the user

  Args:
    id (str): the id of tweet event

  Returns:
    int: the id for the event.  0 means there was an error.
  """
  logger.info("EDIT TWEET %r", id)
  return int(id)
      

def subtract_two_numbers(a: int, b: int) -> int:
  """
  Subtract two numbers
  """

  # The cast is necessary as returned tool call
  # arguments don't always conform exactly to schema
  return int(a) - int(b)


subtract_two_numbers.tool = {
  'type': 'function',
  'function': {
    'name': 'subtract_two_numbers',
    'description': 'Subtract two numbers',
    'parameters': {
      'type': 'object',
      'required': ['a', 'b'],
      'properties': {
        'a': {'type': 'integer',
              'description': 'The first number'},
        'b': {'type': 'integer',
              'description': 'The second number'},
      }
    }
  }
}


#def xx():
#    print("XX1")
#    zzz = utils.get_display_to_user_func()
#    print("ZZZ", zzz)
#    print("XX9")
#    pass


Tools = list(getattr(v, 'tool', v)
             for k,v in globals().items()
             if (type(v)==type(lambda:1) and
                 not k.startswith('_')))
