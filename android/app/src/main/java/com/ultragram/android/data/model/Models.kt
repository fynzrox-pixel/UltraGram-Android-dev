package com.ultragram.android.data.model

import com.google.gson.annotations.SerializedName

data class AuthResponse(
    @SerializedName("user_id") val userId: String? = null,
    val token: String? = null,
    @SerializedName("requires_2fa") val requires2fa: Boolean = false
)

data class User(
    val id: String,
    val email: String? = null,
    val phone: String? = null,
    val profile: Profile? = null,
    val roles: List<String> = emptyList(),
    val verification: String = "Unverified",
    val balance: Long = 0,
    @SerializedName("is_online") val isOnline: Boolean = false
)

data class Profile(
    @SerializedName("display_name") val displayName: String? = null,
    val username: String? = null,
    @SerializedName("avatar_url") val avatarUrl: String? = null,
    val bio: String? = null,
    val theme: String? = null
)

data class UserSearchResult(
    val id: String,
    @SerializedName("display_name") val displayName: String? = null,
    val username: String? = null,
    @SerializedName("avatar_url") val avatarUrl: String? = null,
    val verification: String? = null
)

data class Chat(
    val id: String,
    val type: String,
    val name: String? = null,
    @SerializedName("owner_id") val ownerId: String? = null,
    @SerializedName("last_message") val lastMessage: Message? = null,
    val members: List<String> = emptyList(),
    @SerializedName("other_user_id") val otherUserId: String? = null,
    @SerializedName("other_user") val otherUser: UserSearchResult? = null
)

data class Message(
    val id: String,
    @SerializedName("chat_id") val chatId: String,
    @SerializedName("sender_id") val senderId: String,
    val content: String? = null,
    val type: String = "text",
    @SerializedName("created_at") val createdAt: Long
)

data class Gift(
    val id: String,
    val name: String,
    val description: String? = null,
    val price: Long,
    val rarity: String,
    val category: String? = null
)

data class Wallet(
    val balance: Long,
    val transactions: List<Transaction> = emptyList(),
    val spent: Long = 0,
    val received: Long = 0
)

data class Transaction(
    val id: String,
    @SerializedName("from_user") val fromUser: String? = null,
    @SerializedName("to_user") val toUser: String? = null,
    val amount: Long,
    val type: String,
    val note: String? = null,
    @SerializedName("created_at") val createdAt: Long
)
