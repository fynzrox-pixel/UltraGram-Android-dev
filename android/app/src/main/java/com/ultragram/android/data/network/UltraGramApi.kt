package com.ultragram.android.data.network

import com.ultragram.android.data.model.*
import retrofit2.http.*

interface UltraGramApi {
    @POST("api/auth/phone/register")
    suspend fun register(@Body body: Map<String, String>): AuthResponse

    // Backend accepts phone, email or username in the "login" field.
    @POST("api/auth/phone/login")
    suspend fun login(@Body body: Map<String, String>): AuthResponse

    @GET("api/auth/me")
    suspend fun me(): User

    @POST("api/auth/logout")
    suspend fun logout(): Map<String, Any>

    @PUT("api/profile")
    suspend fun updateProfile(@Body body: Map<String, String>): Map<String, Any>

    @GET("api/users/search")
    suspend fun searchUsers(@Query("q") query: String): List<UserSearchResult>

    @GET("api/chats")
    suspend fun chats(): List<Chat>

    @POST("api/chats")
    suspend fun createChat(@Body body: Map<String, Any>): Chat

    @POST("api/chats/{id}/messages")
    suspend fun sendMessage(@Path("id") chatId: String, @Body body: Map<String, String>): Message

    @GET("api/chats/{id}/messages")
    suspend fun messages(@Path("id") chatId: String): List<Message>

    @GET("api/gifts")
    suspend fun gifts(): List<Gift>

    @GET("api/wallet")
    suspend fun wallet(): Wallet

    @GET("api/health")
    suspend fun health(): Map<String, Any>
}
