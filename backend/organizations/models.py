from django.db import models


class Organization(models.Model):#tellings that model belongs to the models class 
    name = models.CharField(max_length=200)#models = variable name , charfield = used for short text and needs to be specified with a max length
    email = models.EmailField(unique=True)# unique true means no other organization can have the same email address
    phone = models.CharField(max_length=20)
    address = models.TextField()#textfield = used for longer text
    created_at = models.DateTimeField(auto_now_add=True)#This stores the date and time at which the organization was created.
    #auto_now_add=True means Django automatically sets this when the object is created.

    def __str__(self):
        return self.name 