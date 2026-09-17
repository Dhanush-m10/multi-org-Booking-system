import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  organization_name: string;
  organization_email: string;
  organization_phone: string;
  organization_address: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient);

  private readonly baseUrl = 'http://127.0.0.1:8000/api/auth';

  login(credentials: LoginRequest): Observable<LoginResponse> {

    return this.http
      .post<LoginResponse>(
        `${this.baseUrl}/login/`,
        credentials
      )
      .pipe(
        tap(response => {

          localStorage.setItem(
            'access_token',
            response.access
          );

          localStorage.setItem(
            'refresh_token',
            response.refresh
          );

        })
      );
  }

  register(data: RegisterRequest): Observable<any> {

    return this.http.post(
      `${this.baseUrl}/register/`,
      data
    );
  }

  logout(): void {

    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

  }

  getAccessToken(): string | null {

    return localStorage.getItem('access_token');

  }

  getRefreshToken(): string | null {

    return localStorage.getItem('refresh_token');

  }

  isLoggedIn(): boolean {

    return !!this.getAccessToken();

  }
}